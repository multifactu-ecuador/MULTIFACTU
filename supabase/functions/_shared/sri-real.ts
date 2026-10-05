// Firma XAdES-BES real + SOAP real al SRI (Recepción y Autorización).
// Se activa con SRI_MODE=real. Requiere ruta_p12 en empresas, contraseña
// del .p12 cifrada en Supabase Vault (RPC leer_p12_password, sólo
// service_role) y bucket privado "certificados".
import forge from "npm:node-forge@1.4.0";
import { SignedXml } from "npm:xml-crypto@6.1.1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

/** Extrae clave privada y certificado de un PKCS#12 (.p12/.pfx). */
export function extractPkcs12(
  der: Uint8Array,
  password: string,
): { privateKeyPem: string; certPem: string; certDer: Uint8Array; issuerName: string; serialNumber: string } {
  const asn1 = forge.asn1.fromDer(
    forge.util.createBuffer(der.buffer as ArrayBuffer),
  );
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  const keyOid = forge.pki.oids.pkcs8ShroudedKeyBag as string;
  const keyBag = (
    p12.getBags({ bagType: keyOid })[keyOid] ?? []
  )[0] as { key?: unknown } | undefined;
  const keyAltOid = forge.pki.oids.keyBag as string;
  const key =
    keyBag?.key ??
    (p12.getBags({ bagType: keyAltOid })[keyAltOid]?.[0] as
      | { key?: unknown }
      | undefined)?.key;
  const certOid = forge.pki.oids.certBag as string;
  const cert = (p12.getBags({ bagType: certOid })[certOid]?.[0] as
    | { cert?: any }
    | undefined)?.cert;
  if (!key || !cert) throw Error("El .p12 no contiene clave o certificado");
  const certDerBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert))
    .bytes();
  return {
    privateKeyPem: forge.pki.privateKeyToPem(key as any),
    certPem: forge.pki.certificateToPem(cert),
    certDer: Uint8Array.from(certDerBytes, (c: string) =>
      (c as string).charCodeAt(0)
    ),
    issuerName: (cert.issuer.attributes as Array<{ shortName: string; value: string }>)
      .map((a) => `${a.shortName}=${a.value}`)
      .join(", "),
    serialNumber: parseInt(cert.serialNumber, 16).toString(),
  };
}

const b64 = (bytes: Uint8Array) => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

async function sha1Base64(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-1", bytes as BufferSource);
  return b64(new Uint8Array(digest));
}

/**
 * Firma XMLDSig enveloped (RSA-SHA256, C14N exclusivo) con KeyInfo X509Data,
 * más el bloque xades:QualifyingProperties (SigningTime, SigningCertificate
 * con CertDigest SHA-1 e IssuerSerial) => esquema XAdES-BES.
 */
export async function signXades(
  xml: string,
  privateKeyPem: string,
  certPem: string,
  certDer: Uint8Array,
  issuerName: string,
  serialNumber: string,
): Promise<string> {
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "RSA-SHA256",
    canonicalizationAlgorithm:
      "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  (sig as unknown as { id: string }).id = "signature";
  sig.addReference({
    xpath: "//*[local-name(.)='factura']",
    digestAlgorithm: "sha256",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
  });
  sig.computeSignature(xml, {
    prefix: "ds",
    location: { reference: "//*[local-name(.)='factura']", action: "append" },
  });
  let signed = sig.getSignedXml();
  const certDigest = await sha1Base64(certDer);
  const xadesObject =
    `<ds:Object Id="xades-object">` +
    `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#signature">` +
    `<xades:SignedProperties Id="xades-signed-props">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${new Date().toISOString().split(".")[0]}Z</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha1"/>` +
    `<ds:DigestValue>${certDigest}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerial><ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber></xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties></xades:QualifyingProperties></ds:Object>`;
  signed = signed.replace("</ds:Signature>", `${xadesObject}</ds:Signature>`);
  return signed;
}

/** Endpoints oficiales según ambiente. */
export const sriEndpoints = {
  pruebas: {
    recepcion:
      "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion:
      "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
  produccion: {
    recepcion:
      "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion:
      "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
} as const;

const soapHeaders = {
  "Content-Type": "text/xml; charset=utf-8",
  SOAPAction: "",
};

/** Envía el XML firmado al SRI y devuelve la respuesta de autorización. */
export async function realSriFlow(
  signedXml: string,
  ambiente: "pruebas" | "produccion",
): Promise<{ authorized: boolean; xml: string; number: string | null }> {
  const ep = sriEndpoints[ambiente];
  const bin = b64(new TextEncoder().encode(signedXml));
  const reception = await fetch(ep.recepcion, {
    method: "POST",
    headers: soapHeaders,
    signal: AbortSignal.timeout(20000),
    body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sri="http://ec.gob.sri.ws.recepcion"><soapenv:Body><sri:validarComprobante><xml>${bin}</xml></sri:validarComprobante></soapenv:Body></soapenv:Envelope>`,
  });
  if (!reception.ok) throw Error(`Recepción HTTP ${reception.status}`);
  const receptionXml = await reception.text();
  if (!receptionXml.includes("RECIBIDA")) {
    if (receptionXml.includes("DEVUELTA"))
      throw Error("Comprobante devuelto por el SRI: " + receptionXml.slice(0, 400));
    throw Error("Recepción sin estado RECIBIDA");
  }
  const key = signedXml.match(/<claveAcceso>(\d{49})<\/claveAcceso>/)?.[1];
  if (!key) throw Error("Clave de acceso ausente");
  const authorization = await fetch(ep.autorizacion, {
    method: "POST",
    headers: soapHeaders,
    signal: AbortSignal.timeout(20000),
    body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sri="http://ec.gob.sri.ws.autorizacion"><soapenv:Body><sri:autorizacionComprobante><claveAccesoComprobante>${key}</claveAccesoComprobante></sri:autorizacionComprobante></soapenv:Body></soapenv:Envelope>`,
  });
  if (!authorization.ok)
    throw Error(`Autorización HTTP ${authorization.status}`);
  const raw = await authorization.text();
  const decoded = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  const authorized = decoded.includes("<estado>AUTORIZADO</estado>");
  const number =
    decoded.match(/<numeroAutorizacion>([^<]+)</)?.[1] ?? null;
  return { authorized, xml: decoded, number };
}

/** Descarga el .p12 desde Storage (bucket privado "certificados"). */
export async function loadCertificate(
  db: SupabaseClient,
  ruta: string,
  password: string,
) {
  const { data, error } = await db.storage
    .from("certificados")
    .download(ruta);
  if (error || !data) throw Error("No se encontró el .p12 en Storage");
  const bytes = new Uint8Array(await data.arrayBuffer());
  let extracted;
  try {
    extracted = extractPkcs12(bytes, password);
  } catch {
    throw Error("No se pudo abrir el .p12 con la contraseña registrada");
  }
  return extracted;
}
