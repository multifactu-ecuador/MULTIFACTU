import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  generateCreditNoteXml,
  simulateSignature,
  simulateSoap,
  type SriInvoice,
  type SriLine,
} from "../_shared/sri.ts";
import { loadCertificate, realSriFlow, signXades } from "../_shared/sri-real.ts";
interface InsertEvent {
  type: "INSERT";
  schema: "public";
  table: "notas_credito";
  record: { id: string; tenant_id: string };
  old_record: null;
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function equalSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  let mismatch = 0;
  const l = new Uint8Array(left), r = new Uint8Array(right);
  for (let i = 0; i < 32; i++) mismatch |= l[i] ^ r[i];
  return mismatch === 0;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const expected = Deno.env.get("SRI_WEBHOOK_SECRET");
  if (!expected || expected.length < 32)
    return json({ error: "Webhook no configurado" }, 503);
  if (!(await equalSecret(req.headers.get("x-webhook-secret") ?? "", expected)))
    return json({ error: "No autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL"),
    key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Backend no configurado" }, 503);
  let event: InsertEvent;
  try {
    const text = await req.text();
    if (text.length > 65536) return json({ error: "Evento grande" }, 413);
    event = JSON.parse(text);
    if (
      event.type !== "INSERT" || event.schema !== "public" ||
      event.table !== "notas_credito" || event.old_record !== null ||
      !uuid.test(event.record?.id ?? "") || !uuid.test(event.record?.tenant_id ?? "")
    )
      return json({ error: "Evento inválido" }, 400);
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { id, tenant_id: tenant } = event.record;
  const claim = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db
    .from("notas_credito")
    .update({ estado: "Procesando", claim_token: claim, procesamiento_en: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", tenant)
    .eq("estado", "Pendiente")
    .select("*")
    .maybeSingle();
  if (claimError) return json({ error: "No se pudo reclamar" }, 500);
  if (!claimed) return json({ status: "omitido", reason: "No pendiente" });
  try {
    const mode = Deno.env.get("SRI_MODE") ?? "simulation";
    const nota = claimed as Record<string, unknown> & { id: string; factura_id: string };
    const { data: factura, error: fErr } = await db
      .from("facturas_sri")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("id", nota.factura_id)
      .single();
    if (fErr || !factura) throw Error("Factura base no encontrada");
    const { data: lines, error: lErr } = await db
      .from("factura_detalles")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("factura_id", nota.factura_id)
      .order("id");
    if (lErr || !lines?.length) throw Error("Detalles no disponibles");
    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 100000000,
    ).padStart(8, "0");
    const draft = generateCreditNoteXml(
      nota as unknown as Parameters<typeof generateCreditNoteXml>[0],
      factura as unknown as SriInvoice & { clave_acceso: string; fecha: string },
      lines as SriLine[],
      String(nota.motivo ?? ""),
      code,
    );
    let signed: string,
      result: { authorized: boolean; xml: string; number: string | null },
      simulacion = mode !== "real",
      mensaje: string;
    if (mode === "real") {
      const { data: empresa, error: eError } = await db
        .from("empresas")
        .select("ruta_p12,p12_password")
        .eq("id", tenant)
        .single();
      if (eError || !empresa?.ruta_p12 || !empresa?.p12_password)
        throw Error("Empresa sin .p12 o contraseña registrada");
      const cert = await loadCertificate(db, empresa.ruta_p12, empresa.p12_password);
      signed = await signXades(draft.xml, cert.privateKeyPem, cert.certPem, cert.certDer, cert.issuerName, cert.serialNumber);
      result = await realSriFlow(signed, (nota.ambiente_sri as "pruebas" | "produccion") ?? "pruebas");
      mensaje = result.authorized ? "Nota de crédito autorizada por el SRI" : "El SRI no autorizó la nota de crédito";
    } else {
      if (mode !== "simulation") throw Error("SRI_MODE inválido");
      signed = simulateSignature(draft.xml);
      const r = await simulateSoap(signed, id, Deno.env.get("SRI_SIMULATION_RESULT") !== "error");
      result = r;
      mensaje = "SIMULACIÓN: nota de crédito no firmada ni enviada al SRI";
    }
    const { error: updateError } = await db
      .from("notas_credito")
      .update({
        estado: result.authorized ? "Autorizada" : "Error",
        simulacion,
        clave_acceso: draft.key,
        xml_borrador: draft.xml,
        xml_firmado: signed,
        numero_autorizacion: result.authorized ? result.number : null,
        fecha_autorizacion: result.authorized ? new Date().toISOString() : null,
        mensaje,
      })
      .eq("tenant_id", tenant)
      .eq("id", id)
      .eq("claim_token", claim)
      .eq("estado", "Procesando");
    if (updateError) throw Error("No se pudo guardar el resultado");
    return json({ id, estado: result.authorized ? "Autorizada" : "Error", simulacion });
  } catch {
    const { error } = await db
      .from("notas_credito")
      .update({ estado: "Error", mensaje: "Error al firmar/enviar la nota de crédito" })
      .eq("tenant_id", tenant)
      .eq("id", id)
      .eq("claim_token", claim)
      .eq("estado", "Procesando");
    return json({ id, error: error ? "No se pudo persistir el error" : "Emisión de nota fallida" }, 500);
  }
});
