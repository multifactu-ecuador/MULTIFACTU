import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptBuffer,
  encryptBuffer,
  encryptionKeyFromEnv,
  type EncryptedPayload,
} from "./cryptoUtils.ts";
import { firmarFacturaSri, type SriSigningOptions } from "./firmadorSri.ts";
import { extractSigningMaterialFromP12, validarFirmaP12 } from "./p12Validation.ts";

export interface EmisorFirmaRow {
  tenant_id: string;
  ruc_certificado: string;
  certificate_ciphertext: string;
  certificate_iv: string;
  certificate_tag: string;
  password_ciphertext: string;
  password_iv: string;
  password_tag: string;
  key_version: number;
  certificate_fingerprint: string;
  issuer: string;
  serial_number: string;
  valid_from: string;
  expires_at: string;
}

export interface SaveFiscalSignatureInput {
  db: SupabaseClient;
  tenantId: string;
  uploadedBy: string;
  ruc: string;
  /** The service takes ownership of this buffer and zeroes it before returning. */
  p12Buffer: Buffer;
  password: string;
}

export class FiscalSignatureValidationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Fiscal signature validation failed: ${code}`);
    this.name = "FiscalSignatureValidationError";
    this.code = code;
  }
}

function aad(tenantId: string, purpose: "certificate" | "password"): Buffer {
  return Buffer.from(`emisor_firmas:v1:${tenantId}:${purpose}`, "utf8");
}

function toPayload(
  ciphertext: string,
  iv: string,
  tag: string,
): EncryptedPayload {
  return { ciphertext, iv, tag };
}

/**
 * Validates, encrypts, and stores a P12 without sending its contents to
 * Supabase Storage or to the browser. Call only from an authenticated private
 * Node route after deriving tenantId from the user's server-side session.
 */
export async function guardarFirmaEmisor(
  input: SaveFiscalSignatureInput,
): Promise<Pick<EmisorFirmaRow, "expires_at" | "certificate_fingerprint">> {
  const key = Buffer.from(encryptionKeyFromEnv());
  const passwordBuffer = Buffer.from(input.password, "utf8");
  try {
    const validation = validarFirmaP12(input.p12Buffer, input.password, input.ruc);
    if (!validation.valid || !validation.expiresAt || !validation.validFrom) {
      throw new FiscalSignatureValidationError(validation.code);
    }

    const material = extractSigningMaterialFromP12(input.p12Buffer, input.password);
    try {
      const certificate = encryptBuffer(input.p12Buffer, {
        key,
        aad: aad(input.tenantId, "certificate"),
      });
      const password = encryptBuffer(passwordBuffer, {
        key,
        aad: aad(input.tenantId, "password"),
      });
      const fingerprint = createHash("sha256").update(material.certificateDer).digest("hex");

      const { error } = await input.db.from("emisor_firmas").upsert(
        {
          tenant_id: input.tenantId,
          ruc_certificado: input.ruc.replace(/\D/g, ""),
          certificate_ciphertext: certificate.ciphertext,
          certificate_iv: certificate.iv,
          certificate_tag: certificate.tag,
          password_ciphertext: password.ciphertext,
          password_iv: password.iv,
          password_tag: password.tag,
          key_version: 1,
          certificate_fingerprint: fingerprint,
          issuer: validation.issuer ?? "",
          serial_number: validation.serialNumber ?? "",
          valid_from: validation.validFrom.toISOString(),
          expires_at: validation.expiresAt.toISOString(),
          uploaded_by: input.uploadedBy,
        },
        { onConflict: "tenant_id" },
      );
      if (error) throw new Error("Could not persist encrypted fiscal signature", { cause: error });

      return {
        expires_at: validation.expiresAt.toISOString(),
        certificate_fingerprint: fingerprint,
      };
    } finally {
      material.certificateDer.fill(0);
    }
  } finally {
    key.fill(0);
    passwordBuffer.fill(0);
    input.p12Buffer.fill(0);
  }
}

export interface SignInvoiceForTenantInput {
  db: SupabaseClient;
  tenantId: string;
  invoiceXml: string;
  options?: Omit<SriSigningOptions, "rucEsperado">;
}

/** Decrypts only for the duration of an in-memory signing operation. */
export async function firmarFacturaParaTenant(input: SignInvoiceForTenantInput) {
  const { data, error } = await input.db
    .from("emisor_firmas")
    .select(
      "tenant_id,ruc_certificado,certificate_ciphertext,certificate_iv,certificate_tag,password_ciphertext,password_iv,password_tag,key_version,certificate_fingerprint,issuer,serial_number,valid_from,expires_at",
    )
    .eq("tenant_id", input.tenantId)
    .maybeSingle<EmisorFirmaRow>();
  if (error) throw new Error("Could not load fiscal signature", { cause: error });
  if (!data) throw new FiscalSignatureValidationError("SIGNATURE_NOT_CONFIGURED");
  if (new Date(data.expires_at) <= new Date()) throw new FiscalSignatureValidationError("EXPIRED");

  const key = Buffer.from(encryptionKeyFromEnv());
  let p12Buffer: Buffer | undefined;
  let passwordBuffer: Buffer | undefined;
  try {
    p12Buffer = decryptBuffer(
      toPayload(data.certificate_ciphertext, data.certificate_iv, data.certificate_tag),
      { key, aad: aad(input.tenantId, "certificate") },
    );
    passwordBuffer = decryptBuffer(
      toPayload(data.password_ciphertext, data.password_iv, data.password_tag),
      { key, aad: aad(input.tenantId, "password") },
    );

    return firmarFacturaSri(input.invoiceXml, p12Buffer, passwordBuffer.toString("utf8"), {
      ...input.options,
      rucEsperado: data.ruc_certificado,
    });
  } finally {
    key.fill(0);
    p12Buffer?.fill(0);
    passwordBuffer?.fill(0);
  }
}

export interface SignStoredInvoiceInput {
  db: SupabaseClient;
  tenantId: string;
  invoiceId: string;
  /** Preserve the worker's compare-and-swap claim when one is being used. */
  claimToken?: string;
  options?: Omit<SriSigningOptions, "rucEsperado">;
}

/**
 * Practical worker integration: fetches the draft only within its tenant,
 * signs it in RAM, and persists only the resulting signed XML. The SRI SOAP
 * sender must run immediately afterwards using the returned `signedXml`.
 */
export async function firmarBorradorFacturaParaTenant(input: SignStoredInvoiceInput) {
  const { data: invoice, error: loadError } = await input.db
    .from("facturas_sri")
    .select("id,xml_borrador,estado,claim_token")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.invoiceId)
    .maybeSingle<{ id: string; xml_borrador: string | null; estado: string; claim_token: string | null }>();
  if (loadError) throw new Error("Could not load invoice draft", { cause: loadError });
  if (!invoice?.xml_borrador) throw new Error("Invoice draft XML is not available");
  if (invoice.estado !== "Procesando") throw new Error("Invoice is not claimed for processing");
  if (input.claimToken && invoice.claim_token !== input.claimToken) {
    throw new Error("Invoice claim no longer belongs to this worker");
  }

  const signature = await firmarFacturaParaTenant({
    db: input.db,
    tenantId: input.tenantId,
    invoiceXml: invoice.xml_borrador,
    options: input.options,
  });

  let update = input.db
    .from("facturas_sri")
    .update({ xml_firmado: signature.signedXml })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.invoiceId)
    .eq("estado", "Procesando");
  if (input.claimToken) update = update.eq("claim_token", input.claimToken);
  const { data: updatedRows, error: updateError } = await update.select("id");
  if (updateError) throw new Error("Could not persist signed invoice XML", { cause: updateError });
  // Sin fila afectada la reclamación ya no es nuestra (por ejemplo el
  // barredor devolvió la factura a Pendiente): el firmado NO se guardó y
  // responder éxito haría que el llamador emitiera sobre un claim perdido.
  if (!updatedRows || updatedRows.length !== 1) {
    throw new Error("Invoice claim lost before the signed XML was persisted");
  }

  return signature;
}
