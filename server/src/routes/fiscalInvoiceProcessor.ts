import type { SupabaseClient } from "@supabase/supabase-js";
import { firmarBorradorFacturaParaTenant } from "../fiscal/fiscalSignatureService.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InternalInvoiceJob {
  tenantId: string;
  invoiceId: string;
  claimToken: string;
}

/**
 * Invoke this from the private queue/worker only, after the invoice draft has
 * been stored and atomically claimed as `Procesando`. Do not expose this route
 * to the browser; authenticate the queue before calling it.
 */
export async function procesarFirmaFiscal(
  job: InternalInvoiceJob,
  db: SupabaseClient,
): Promise<{ signatureId: string; signingTime: string }> {
  if (!UUID.test(job.tenantId) || !UUID.test(job.invoiceId) || !UUID.test(job.claimToken)) {
    throw new Error("Invalid internal invoice job identifiers");
  }

  const signed = await firmarBorradorFacturaParaTenant({
    db,
    tenantId: job.tenantId,
    invoiceId: job.invoiceId,
    claimToken: job.claimToken,
  });

  // The caller now sends signed.signedXml to the SRI reception SOAP endpoint,
  // then updates estado, xml_autorizado, and numero_autorizacion in the same
  // tenant- and claim-scoped processing flow.
  return { signatureId: signed.signatureId, signingTime: signed.signingTime };
}
