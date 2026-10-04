import forge from "node-forge";

export type P12ValidationCode =
  | "VALID"
  | "INVALID_PASSWORD_OR_FILE"
  | "MISSING_SIGNING_KEY"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "RUC_MISMATCH"
  | "IDENTIFICATION_NOT_FOUND";

export interface P12ValidationResult {
  valid: boolean;
  code: P12ValidationCode;
  expiresAt?: Date;
  validFrom?: Date;
  certificateIdentifications: string[];
  issuer?: string;
  serialNumber?: string;
}

export interface SigningMaterial {
  privateKeyPem: string;
  certificatePem: string;
  certificateDer: Buffer;
  certificate: forge.pki.Certificate;
}

const IDENTIFICATION_PATTERN = /(?<!\d)\d{10,13}(?!\d)/g;

function normaliseIdentification(value: string): string {
  return value.replace(/\D/g, "");
}

function certificateTextValues(certificate: forge.pki.Certificate): string[] {
  const values = new Set<string>();
  const seen = new Set<object>();
  const collect = (value: unknown, depth = 0) => {
    if (typeof value === "string") {
      values.add(value);
      return;
    }
    if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return;
    seen.add(value);
    for (const nestedValue of Object.values(value)) collect(nestedValue, depth + 1);
  };

  for (const attribute of certificate.subject.attributes) collect(attribute);
  for (const extension of certificate.extensions ?? []) collect(extension);

  return [...values];
}

/**
 * Ecuadorian certificates vary by issuing authority. Search structured subject
 * attributes and extension strings without accepting a partial ID match.
 */
export function extractCertificateIdentifications(
  certificate: forge.pki.Certificate,
): string[] {
  const found = new Set<string>();
  for (const text of certificateTextValues(certificate)) {
    for (const match of text.matchAll(IDENTIFICATION_PATTERN)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

function issuerString(certificate: forge.pki.Certificate): string {
  return certificate.issuer.attributes
    .map((attribute) => `${attribute.shortName ?? attribute.name ?? attribute.type}=${String(attribute.value ?? "")}`)
    .join(", ");
}

function parseP12(p12Buffer: Buffer, password: string): forge.pkcs12.Pkcs12Pfx {
  // node-forge's binary encoding is intentionally used here; the P12 never
  // touches disk and this transient representation is released after parsing.
  const der = forge.util.createBuffer(p12Buffer.toString("latin1"), "raw");
  return forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, password);
}

function selectSigningMaterial(p12: forge.pkcs12.Pkcs12Pfx): SigningMaterial | undefined {
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certificates = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];

  for (const keyBag of keyBags) {
    if (!keyBag.key) continue;
    // SRI signing certificates use RSA. node-forge types PublicKey as a union,
    // so narrow the key pair only after the bag has supplied a private key.
    const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
    const matchedCertificate = certificates.find((certificateBag) => {
      const publicKey = certificateBag.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return publicKey?.n?.compareTo(privateKey.n) === 0 && publicKey?.e?.compareTo(privateKey.e) === 0;
    });

    if (!matchedCertificate?.cert) continue;
    const certificateDer = Buffer.from(
      forge.asn1.toDer(forge.pki.certificateToAsn1(matchedCertificate.cert)).getBytes(),
      "latin1",
    );
    return {
      privateKeyPem: forge.pki.privateKeyToPem(privateKey),
      certificatePem: forge.pki.certificateToPem(matchedCertificate.cert),
      certificateDer,
      certificate: matchedCertificate.cert,
    };
  }

  return undefined;
}

export function extractSigningMaterialFromP12(
  p12Buffer: Buffer,
  password: string,
): SigningMaterial {
  const material = selectSigningMaterial(parseP12(p12Buffer, password));
  if (!material) throw new Error("P12 does not contain a matching RSA signing key and certificate");
  return material;
}

/**
 * Validates the uploaded P12 in RAM. Password/file parsing errors deliberately
 * share one public code so an attacker cannot use the endpoint as an oracle.
 */
export function validarFirmaP12(
  p12Buffer: Buffer,
  password: string,
  rucEsperado: string,
  now = new Date(),
): P12ValidationResult {
  try {
    const material = selectSigningMaterial(parseP12(p12Buffer, password));
    if (!material) {
      return { valid: false, code: "MISSING_SIGNING_KEY", certificateIdentifications: [] };
    }

    const { certificate } = material;
    const expiresAt = certificate.validity.notAfter;
    const validFrom = certificate.validity.notBefore;
    const certificateIdentifications = extractCertificateIdentifications(certificate);
    const common = {
      expiresAt,
      validFrom,
      certificateIdentifications,
      issuer: issuerString(certificate),
      serialNumber: certificate.serialNumber,
    };

    if (now < validFrom) return { valid: false, code: "NOT_YET_VALID", ...common };
    if (now >= expiresAt) return { valid: false, code: "EXPIRED", ...common };

    const expected = normaliseIdentification(rucEsperado);
    if (!/^\d{10,13}$/.test(expected)) {
      throw new Error("rucEsperado must contain 10 to 13 digits");
    }
    if (!certificateIdentifications.length) {
      return { valid: false, code: "IDENTIFICATION_NOT_FOUND", ...common };
    }
    if (!certificateIdentifications.some((id) => id === expected)) {
      return { valid: false, code: "RUC_MISMATCH", ...common };
    }

    return { valid: true, code: "VALID", ...common };
  } catch {
    return {
      valid: false,
      code: "INVALID_PASSWORD_OR_FILE",
      certificateIdentifications: [],
    };
  }
}
