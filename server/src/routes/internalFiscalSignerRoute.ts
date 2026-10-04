import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { procesarFirmaFiscal, type InternalInvoiceJob } from "./fiscalInvoiceProcessor.ts";

function hasValidInternalToken(received: string | null, expected: string): boolean {
  if (!received || expected.length < 32) return false;
  const receivedBuffer = Buffer.from(received, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  try {
    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
  } finally {
    receivedBuffer.fill(0);
    expectedBuffer.fill(0);
  }
}

/**
 * Mount this as POST /internal/sri/sign in the private Node service. The Edge
 * webhook may call it with a shared internal secret, but the browser never may.
 */
export async function firmarFacturaInterna(
  request: Request,
  db: SupabaseClient,
  internalToken = process.env.FISCAL_SIGNER_INTERNAL_TOKEN ?? "",
): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  if (!hasValidInternalToken(request.headers.get("x-fiscal-signer-token"), internalToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > 4_096) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let job: InternalInvoiceJob;
  try {
    job = (await request.json()) as InternalInvoiceJob;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await procesarFirmaFiscal(job, db);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // Do not return validation internals, certificate data, or SQL errors.
    console.error("Internal fiscal signing failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ ok: false, error: "Fiscal signature could not be produced" }, { status: 422 });
  }
}
