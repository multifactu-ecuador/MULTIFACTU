import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import forge from "node-forge";
import { decryptBuffer, encryptBuffer } from "../src/fiscal/cryptoUtils.ts";
import { firmarFacturaSri } from "../src/fiscal/firmadorSri.ts";
import { validarFirmaP12 } from "../src/fiscal/p12Validation.ts";

const PASSWORD = "secreto-de-prueba";
const RUC = "1790012345001";

function makeP12(): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  certificate.validity.notBefore = new Date("2025-01-01T00:00:00Z");
  certificate.validity.notAfter = new Date("2030-01-01T00:00:00Z");
  const identity = [
    { name: "commonName", value: "Emisor de prueba" },
    { name: "serialNumber", value: RUC },
  ];
  certificate.setSubject(identity);
  certificate.setIssuer(identity);
  certificate.sign(keys.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], PASSWORD, {
    algorithm: "aes256",
    count: 2048,
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "latin1");
}

test("AES-256-GCM authenticates a P12 buffer and its tenant context", () => {
  const key = randomBytes(32);
  const aad = Buffer.from("emisor_firmas:v1:tenant-a:certificate");
  const original = Buffer.from("not-a-real-p12");
  const encrypted = encryptBuffer(original, { key, aad });

  assert.notEqual(encrypted.ciphertext, original.toString("base64"));
  assert.deepEqual(decryptBuffer(encrypted, { key, aad }), original);
  assert.throws(() => decryptBuffer(encrypted, { key, aad: Buffer.from("other-tenant") }));
});

test("validarFirmaP12 checks password, validity dates, and exact RUC", () => {
  const p12 = makeP12();
  const current = new Date("2026-10-04T12:00:00Z");

  const valid = validarFirmaP12(p12, PASSWORD, RUC, current);
  assert.equal(valid.valid, true);
  assert.equal(valid.code, "VALID");
  assert.ok(valid.expiresAt);

  const mismatch = validarFirmaP12(p12, PASSWORD, "0999999999001", current);
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.code, "RUC_MISMATCH");

  const expired = validarFirmaP12(p12, PASSWORD, RUC, new Date("2031-01-01T00:00:00Z"));
  assert.equal(expired.valid, false);
  assert.equal(expired.code, "EXPIRED");

  const badPassword = validarFirmaP12(p12, "incorrecta", RUC, current);
  assert.equal(badPassword.valid, false);
  assert.equal(badPassword.code, "INVALID_PASSWORD_OR_FILE");
  p12.fill(0);
});

test("firmarFacturaSri returns a locally verifiable enveloped XAdES-BES signature", () => {
  const p12 = makeP12();
  const invoice = `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.0.0"><infoTributaria><razonSocial>Emisor de prueba</razonSocial></infoTributaria></factura>`;

  const result = firmarFacturaSri(invoice, p12, PASSWORD, {
    rucEsperado: RUC,
    now: new Date("2026-10-04T12:34:56Z"),
  });

  assert.match(result.signedXml, /<ds:Signature\b/);
  assert.match(result.signedXml, /<xades:SignedProperties\b/);
  assert.match(result.signedXml, /2026-10-04T07:34:56-05:00/);
  assert.match(result.signedXml, /<ds:KeyInfo\b/);
  p12.fill(0);
});
