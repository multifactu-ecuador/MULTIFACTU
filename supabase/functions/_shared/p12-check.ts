// Verificación de contraseña y vigencia del certificado .p12 (Deno).
// Espejo de server/src/fiscal/p12Validation.ts, adaptado a Uint8Array y
// con códigos que distinguen contraseña errada de archivo dañado para que
// el ADMIN (dueño del archivo) entienda qué corregir. Todo ocurre en RAM.
import forge from "npm:node-forge@1.4.0";

export type P12CheckCode =
  | "VALID"
  | "INVALID_PASSWORD"
  | "INVALID_FILE"
  | "NO_SIGNING_KEY"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "RUC_MISMATCH";

export interface P12CheckResult {
  /** true si la contraseña abre el .p12 (aunque el certificado tenga otra alerta). */
  passwordOk: boolean;
  code: P12CheckCode;
  emisor?: string;
  serie?: string;
  validoDesde?: string;
  expira?: string;
  /** false si el certificado no muestra el RUC (ni la cédula base) de la empresa. */
  rucCoincide?: boolean;
}

const ID_PATTERN = /(?<!\d)\d{10,13}(?!\d)/g;

function collectStrings(value: unknown, out: Set<string>, depth = 0, seen = new Set<object>()): void {
  if (typeof value === "string") {
    out.add(value);
    return;
  }
  if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return;
  seen.add(value);
  for (const nested of Object.values(value)) collectStrings(nested, out, depth + 1, seen);
}

function certificateIdentifications(cert: forge.pki.Certificate): string[] {
  const texts = new Set<string>();
  for (const attribute of cert.subject.attributes) collectStrings(attribute, texts);
  for (const extension of cert.extensions ?? []) collectStrings(extension, texts);
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(ID_PATTERN)) found.add(match[0]);
  }
  return [...found];
}

/**
 * Abre el .p12 con la contraseña candidata y evalúa el certificado de firma.
 * Nunca registra ni devuelve la contraseña; el buffer del .p12 es del llamador.
 */
export function verificarCertificadoP12(
  der: Uint8Array,
  password: string,
  rucEsperado: string,
  now = new Date(),
): P12CheckResult {
  let cert: forge.pki.Certificate;
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(
      forge.util.createBuffer(der.buffer as ArrayBuffer),
    );
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const certOid = forge.pki.oids.certBag as string;
    const found = (p12.getBags({ bagType: certOid })[certOid]?.[0] as
      | { cert?: forge.pki.Certificate }
      | undefined)?.cert;
    if (!found) return { passwordOk: false, code: "INVALID_FILE" };
    cert = found;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // node-forge rechaza contraseñas erradas en la verificación MAC; un
    // archivo corrupto falla antes, en el parseo ASN.1.
    const wrongPassword = /mac|password/i.test(message);
    return { passwordOk: false, code: wrongPassword ? "INVALID_PASSWORD" : "INVALID_FILE" };
  }

  const keyOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
  const keyAltOid = forge.pki.oids.keyBag as string;
  const keyBags = (p12.getBags({ bagType: keyOid })[keyOid] ?? []).length +
    (p12.getBags({ bagType: keyAltOid })[keyAltOid] ?? []).length;

  const comun = {
    emisor: cert.issuer.attributes
      .map((a) => `${a.shortName ?? a.name ?? a.type}=${String(a.value ?? "")}`)
      .join(", "),
    serie: cert.serialNumber,
    validoDesde: cert.validity.notBefore.toISOString(),
    expira: cert.validity.notAfter.toISOString(),
  };

  if (!keyBags) return { passwordOk: true, code: "NO_SIGNING_KEY", ...comun };
  if (now < cert.validity.notBefore) return { passwordOk: true, code: "NOT_YET_VALID", ...comun };
  if (now >= cert.validity.notAfter) return { passwordOk: true, code: "EXPIRED", ...comun };

  const esperado = rucEsperado.replace(/\D/g, "");
  if (esperado) {
    const ids = certificateIdentifications(cert);
    // RUC de persona natural = cédula + sufijo: acepta el RUC completo o su cédula base.
    const coincide = ids.some((id) =>
      id === esperado || (esperado.length === 13 && id === esperado.slice(0, 10))
    );
    if (!coincide) {
      return { passwordOk: true, code: "RUC_MISMATCH", rucCoincide: false, ...comun };
    }
  }
  return { passwordOk: true, code: "VALID", rucCoincide: true, ...comun };
}
