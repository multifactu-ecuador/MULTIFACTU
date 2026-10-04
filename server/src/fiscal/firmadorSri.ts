import { createHash, createSign, randomUUID } from "node:crypto";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";
import { extractSigningMaterialFromP12, validarFirmaP12 } from "./p12Validation.ts";

const DS_NS = "http://www.w3.org/2000/09/xmldsig#";
const XADES_NS = "http://uri.etsi.org/01903/v1.3.2#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";
const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SIGNED_PROPERTIES_TYPE = "http://uri.etsi.org/01903#SignedProperties";

export type SriSigningAlgorithm = "rsa-sha256" | "rsa-sha1";

export interface SriSigningOptions {
  /** SHA-256 is the production default. SHA-1 exists only for legacy certificates. */
  algorithm?: SriSigningAlgorithm;
  /** Checks that the certificate ownership is the same RUC as the issuer. */
  rucEsperado?: string;
  now?: Date;
}

export interface SriSignatureResult {
  signedXml: string;
  signatureId: string;
  signingTime: string;
  algorithm: SriSigningAlgorithm;
}

function append(
  document: Document,
  parent: Element,
  namespace: string,
  name: string,
  text?: string,
): Element {
  const child = document.createElementNS(namespace, name);
  if (text !== undefined) child.appendChild(document.createTextNode(text));
  parent.appendChild(child);
  return child;
}

function digest(value: string | Buffer, algorithm: SriSigningAlgorithm): string {
  return createHash(algorithm === "rsa-sha256" ? "sha256" : "sha1")
    .update(value)
    .digest("base64");
}

function canonicalize(node: Node): string {
  // xml-crypto's canonicalizer is used for exactly the algorithm declared in
  // each reference, avoiding serializer-dependent signature bytes.
  return new SignedXml().getCanonXml([C14N], node);
}

function setDigest(
  document: Document,
  reference: Element,
  source: Node,
  algorithm: SriSigningAlgorithm,
): void {
  append(
    document,
    reference,
    DS_NS,
    "ds:DigestMethod",
  ).setAttribute("Algorithm", algorithm === "rsa-sha256" ? SHA256 : SHA1);
  append(document, reference, DS_NS, "ds:DigestValue", digest(canonicalize(source), algorithm));
}

function ecuadorSigningTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}-05:00`;
}

function issuerSerialAsDecimal(serialNumber: string): string {
  const normalized = serialNumber.replace(/^0+/, "") || "0";
  return BigInt(`0x${normalized}`).toString(10);
}

function assertInvoiceDocument(xml: string): Document {
  if (!xml.trim()) throw new Error("Invoice XML is required");
  if (/<!DOCTYPE/i.test(xml)) throw new Error("DOCTYPE is not allowed in an invoice XML");

  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (!document.documentElement || document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Invoice XML is not well formed");
  }
  if (document.documentElement.localName !== "factura") {
    throw new Error("Only an SRI <factura> document can be signed");
  }
  if (document.getElementsByTagNameNS(DS_NS, "Signature").length > 0) {
    throw new Error("Invoice XML already contains a digital signature");
  }
  return document;
}

function elementById(document: Document, id: string): Element {
  const candidates = document.getElementsByTagName("*");
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates.item(index);
    if (candidate?.getAttribute("Id") === id) return candidate;
  }
  throw new Error(`Signature element ${id} was not found`);
}

/**
 * Creates an enveloped XAdES-BES signature fully in RAM. It signs the invoice
 * document, KeyInfo, and xades:SignedProperties, then verifies the result
 * before returning it. The caller remains responsible for SRI schema and
 * authorization-service validation.
 */
export function firmarFacturaSri(
  invoiceXml: string,
  p12Buffer: Buffer,
  password: string,
  options: SriSigningOptions = {},
): SriSignatureResult {
  const now = options.now ?? new Date();
  const validation = validarFirmaP12(p12Buffer, password, options.rucEsperado ?? "0000000000", now);
  // If no issuer RUC was supplied we still validate the password, usable key,
  // and certificate validity. Ownership validation is mandatory at onboarding.
  if (options.rucEsperado && !validation.valid) {
    throw new Error(`Certificate validation failed: ${validation.code}`);
  }
  if (!options.rucEsperado && !["VALID", "RUC_MISMATCH"].includes(validation.code)) {
    throw new Error(`Certificate validation failed: ${validation.code}`);
  }

  const document = assertInvoiceDocument(invoiceXml);
  const algorithm = options.algorithm ?? "rsa-sha256";
  const material = extractSigningMaterialFromP12(p12Buffer, password);
  const signatureId = `Signature-${randomUUID()}`;
  const signedPropertiesId = `SignedProperties-${randomUUID()}`;
  const keyInfoId = `KeyInfo-${randomUUID()}`;
  const documentReferenceId = `Reference-Document-${randomUUID()}`;
  const signingTime = ecuadorSigningTime(now);
  const root = document.documentElement;

  const signature = document.createElementNS(DS_NS, "ds:Signature");
  signature.setAttribute("Id", signatureId);

  const signedInfo = append(document, signature, DS_NS, "ds:SignedInfo");
  append(document, signedInfo, DS_NS, "ds:CanonicalizationMethod").setAttribute("Algorithm", C14N);
  append(document, signedInfo, DS_NS, "ds:SignatureMethod").setAttribute(
    "Algorithm",
    algorithm === "rsa-sha256" ? RSA_SHA256 : RSA_SHA1,
  );

  const documentReference = append(document, signedInfo, DS_NS, "ds:Reference");
  documentReference.setAttribute("Id", documentReferenceId);
  documentReference.setAttribute("URI", "");
  const transforms = append(document, documentReference, DS_NS, "ds:Transforms");
  append(document, transforms, DS_NS, "ds:Transform").setAttribute("Algorithm", ENVELOPED);
  append(document, transforms, DS_NS, "ds:Transform").setAttribute("Algorithm", C14N);
  // The Signature is not attached yet, so C14N(root) is exactly the input to
  // the enveloped transform at verification time.
  setDigest(document, documentReference, root, algorithm);

  const keyInfo = append(document, signature, DS_NS, "ds:KeyInfo");
  keyInfo.setAttribute("Id", keyInfoId);
  const x509Data = append(document, keyInfo, DS_NS, "ds:X509Data");
  append(document, x509Data, DS_NS, "ds:X509Certificate", material.certificateDer.toString("base64"));

  const object = append(document, signature, DS_NS, "ds:Object");
  const qualifyingProperties = append(document, object, XADES_NS, "xades:QualifyingProperties");
  qualifyingProperties.setAttribute("Target", `#${signatureId}`);
  const signedProperties = append(document, qualifyingProperties, XADES_NS, "xades:SignedProperties");
  signedProperties.setAttribute("Id", signedPropertiesId);
  // SignedProperties contains ds:* descendants. Keep that inherited prefix in
  // its canonical form as required when this detached reference is digested.
  signedProperties.setAttribute("xmlns:ds", DS_NS);
  const signedSignatureProperties = append(
    document,
    signedProperties,
    XADES_NS,
    "xades:SignedSignatureProperties",
  );
  append(document, signedSignatureProperties, XADES_NS, "xades:SigningTime", signingTime);
  const signingCertificate = append(document, signedSignatureProperties, XADES_NS, "xades:SigningCertificate");
  const cert = append(document, signingCertificate, XADES_NS, "xades:Cert");
  const certDigest = append(document, cert, XADES_NS, "xades:CertDigest");
  append(document, certDigest, DS_NS, "ds:DigestMethod").setAttribute(
    "Algorithm",
    algorithm === "rsa-sha256" ? SHA256 : SHA1,
  );
  append(document, certDigest, DS_NS, "ds:DigestValue", digest(material.certificateDer, algorithm));
  const issuerSerial = append(document, cert, XADES_NS, "xades:IssuerSerial");
  append(
    document,
    issuerSerial,
    DS_NS,
    "ds:X509IssuerName",
    material.certificate.issuer.attributes
      .map((attribute) => `${attribute.shortName ?? attribute.name ?? attribute.type}=${String(attribute.value ?? "")}`)
      .join(", "),
  );
  append(
    document,
    issuerSerial,
    DS_NS,
    "ds:X509SerialNumber",
    issuerSerialAsDecimal(material.certificate.serialNumber),
  );
  const signedDataObjectProperties = append(document, signedProperties, XADES_NS, "xades:SignedDataObjectProperties");
  const dataObjectFormat = append(document, signedDataObjectProperties, XADES_NS, "xades:DataObjectFormat");
  dataObjectFormat.setAttribute("ObjectReference", `#${documentReferenceId}`);
  append(document, dataObjectFormat, XADES_NS, "xades:Description", "Comprobante electrónico SRI");
  append(document, dataObjectFormat, XADES_NS, "xades:MimeType", "text/xml");

  const keyInfoReference = append(document, signedInfo, DS_NS, "ds:Reference");
  keyInfoReference.setAttribute("URI", `#${keyInfoId}`);

  const propertiesReference = append(document, signedInfo, DS_NS, "ds:Reference");
  propertiesReference.setAttribute("Type", SIGNED_PROPERTIES_TYPE);
  propertiesReference.setAttribute("URI", `#${signedPropertiesId}`);

  // Attach after the document digest is calculated. This preserves the
  // enveloped-reference semantics, then lets each detached subtree acquire the
  // exact namespace context it will have in the final serialized XML.
  root.appendChild(signature);
  const digestDocument = new DOMParser().parseFromString(
    new XMLSerializer().serializeToString(document),
    "application/xml",
  );
  setDigest(document, keyInfoReference, elementById(digestDocument, keyInfoId), algorithm);
  setDigest(document, propertiesReference, elementById(digestDocument, signedPropertiesId), algorithm);

  // Canonicalize a re-parsed SignedInfo, which is the same shape the SRI and
  // independent validators will consume after XML serialization.
  const signatureDocument = new DOMParser().parseFromString(
    new XMLSerializer().serializeToString(document),
    "application/xml",
  );
  const signedInfoForSignature = signatureDocument.getElementsByTagNameNS(DS_NS, "SignedInfo").item(0);
  if (!signedInfoForSignature) throw new Error("SignedInfo could not be serialized");

  const signer = createSign(algorithm === "rsa-sha256" ? "RSA-SHA256" : "RSA-SHA1");
  signer.update(canonicalize(signedInfoForSignature));
  signer.end();
  append(document, signature, DS_NS, "ds:SignatureValue", signer.sign(material.privateKeyPem).toString("base64"));

  const signedXml = new XMLSerializer().serializeToString(document);

  const verifier = new SignedXml({ publicCert: material.certificatePem });
  verifier.loadSignature(signature);
  if (!verifier.checkSignature(signedXml)) {
    const detail = verifier
      .getReferences()
      .map((reference) => reference.validationError?.message ?? "signature value mismatch")
      .join("; ");
    throw new Error(`Local XML signature verification failed: ${detail}`);
  }

  // Minimize duration of sensitive material. The caller owns and clears the P12 buffer.
  material.certificateDer.fill(0);
  return { signedXml, signatureId, signingTime, algorithm };
}
