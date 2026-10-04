import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FiscalSignatureValidationError,
  guardarFirmaEmisor,
} from "../fiscal/fiscalSignatureService.ts";

const MAX_P12_BYTES = 5 * 1024 * 1024;

/** Injected by the application's authentication middleware, never by JSON input. */
export interface AuthenticatedFiscalContext {
  tenantId: string;
  userId: string;
  ruc: string;
  role: "ADMIN" | "CAJERO";
}

/**
 * Framework-neutral Fetch handler. In Express/Fastify, adapt the same checks
 * and derive `context` from the validated access token/session on the server.
 */
export async function uploadFiscalSignature(
  request: Request,
  context: AuthenticatedFiscalContext,
  db: SupabaseClient,
): Promise<Response> {
  if (context.role !== "ADMIN") {
    return Response.json({ error: "Solo un administrador puede actualizar la firma" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("p12");
  const password = form.get("password");
  if (!(file instanceof File) || typeof password !== "string" || !password) {
    return Response.json({ error: "Se requiere un archivo .p12 y su contraseña" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".p12") || file.size === 0 || file.size > MAX_P12_BYTES) {
    return Response.json({ error: "El archivo .p12 debe medir entre 1 byte y 5 MB" }, { status: 400 });
  }

  const p12Buffer = Buffer.from(await file.arrayBuffer());
  try {
    const saved = await guardarFirmaEmisor({
      db,
      tenantId: context.tenantId,
      uploadedBy: context.userId,
      ruc: context.ruc,
      p12Buffer,
      password,
    });
    return Response.json({ ok: true, expiresAt: saved.expires_at, fingerprint: saved.certificate_fingerprint });
  } catch (error) {
    if (error instanceof FiscalSignatureValidationError) {
      return Response.json({ ok: false, code: error.code }, { status: 422 });
    }
    throw error;
  }
}
