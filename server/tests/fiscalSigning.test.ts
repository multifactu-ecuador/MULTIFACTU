import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import forge from "node-forge";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptBuffer, encryptBuffer } from "../src/fiscal/cryptoUtils.ts";
import { firmarBorradorFacturaParaTenant } from "../src/fiscal/fiscalSignatureService.ts";
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

/** Cadea mínima de PostgREST para el servicio de firma, enrutada por tabla. */
function fakeDb(rows: {
  invoice: Record<string, unknown>;
  firma: Record<string, unknown>;
  persist: { data: Array<{ id: string }>; error: unknown };
}): SupabaseClient {
  return {
    from(table: string) {
      let updating = false;
      const row = table === "emisor_firmas" ? rows.firma : rows.invoice;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.update = () => {
        updating = true;
        return chain;
      };
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({
        data: updating ? null : row,
        error: null,
      });
      chain.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) =>
        Promise.resolve(updating ? rows.persist : { data: null, error: null }).then(
          resolve,
          reject,
        );
      return chain as unknown as SupabaseClient;
    },
  } as unknown as SupabaseClient;
}

test("firmarBorradorFacturaParaTenant never reports success when the claim was lost", async () => {
  const key = randomBytes(32);
  process.env.ENCRYPTION_KEY = key.toString("hex");
  const p12 = makeP12();
  const tenant = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const invoiceId = "11111111-2222-4333-8444-555555555555";
  const claim = "99999999-8888-4777-8666-555555555555";
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="1.0.0">` +
    `<infoTributaria><razonSocial>Emisor de prueba</razonSocial></infoTributaria></factura>`;
  const cert = encryptBuffer(p12, {
    key,
    aad: Buffer.from(`emisor_firmas:v1:${tenant}:certificate`),
  });
  const password = encryptBuffer(Buffer.from(PASSWORD, "utf8"), {
    key,
    aad: Buffer.from(`emisor_firmas:v1:${tenant}:password`),
  });
  const db = fakeDb({
    invoice: {
      id: invoiceId,
      xml_borrador: xml,
      estado: "Procesando",
      claim_token: claim,
    },
    firma: {
      tenant_id: tenant,
      ruc_certificado: RUC,
      certificate_ciphertext: cert.ciphertext,
      certificate_iv: cert.iv,
      certificate_tag: cert.tag,
      password_ciphertext: password.ciphertext,
      password_iv: password.iv,
      password_tag: password.tag,
      key_version: 1,
      certificate_fingerprint: "de-prueba",
      issuer: "",
      serial_number: "",
      valid_from: new Date("2025-01-01T00:00:00Z").toISOString(),
      expires_at: new Date("2030-01-01T00:00:00Z").toISOString(),
    },
    // El update no afecta ninguna fila: el claim ya no es nuestro (p. ej. el
    // barredor devolvió la factura a Pendiente) y el firmado no se guardó.
    persist: { data: [], error: null },
  });

  await assert.rejects(
    () =>
      firmarBorradorFacturaParaTenant({
        db,
        tenantId: tenant,
        invoiceId,
        claimToken: claim,
      }),
    /claim lost/,
    "la pérdida de la reclamación debe abortar, nunca responder éxito",
  );
  p12.fill(0);
});
