import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  generateXml,
  simulateSignature,
  simulateSoap,
  type SriInvoice,
  type SriLine,
} from "../_shared/sri.ts";
import { loadCertificate, realSriFlow, signXades } from "../_shared/sri-real.ts";
interface InsertEvent {
  type: "INSERT";
  schema: "public";
  table: "facturas_sri";
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
  const l = new Uint8Array(left),
    r = new Uint8Array(right);
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
    if (text.length > 65536)
      return json({ error: "Evento demasiado grande" }, 413);
    event = JSON.parse(text);
    if (
      event.type !== "INSERT" ||
      event.schema !== "public" ||
      event.table !== "facturas_sri" ||
      event.old_record !== null ||
      !uuid.test(event.record?.id ?? "") ||
      !uuid.test(event.record?.tenant_id ?? "")
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
  // CAS: sólo una invocación puede reclamar Pendiente. No confiar en importes del payload.
  const { data: claimed, error: claimError } = await db
    .from("facturas_sri")
    .update({
      estado: "Procesando",
      claim_token: claim,
      procesamiento_en: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("tenant_id", tenant)
    .eq("estado", "Pendiente")
    .select("*")
    .maybeSingle();
  if (claimError) return json({ error: "No se pudo reclamar factura" }, 500);
  if (!claimed)
    return json({ status: "omitido", reason: "No pendiente o ya procesada" });
  try {
    const mode = Deno.env.get("SRI_MODE") ?? "simulation";
    const invoice = claimed as SriInvoice;
    const { data: lines, error } = await db
      .from("factura_detalles")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("factura_id", id)
      .order("id");
    if (error || !lines?.length) throw Error("Detalles no disponibles");
    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0] % 100000000,
    ).padStart(8, "0");
    const draft = generateXml(invoice, lines as SriLine[], code);
    let signed: string,
      result: { authorized: boolean; xml: string; number: string | null },
      simulacion = mode !== "real",
      mensaje: string;
    if (mode === "real") {
      // Ruta real: .p12 de la empresa + firma XAdES + SOAP al SRI.
      const { data: empresa, error: eError } = await db
        .from("empresas")
        .select("ruta_p12,p12_password")
        .eq("id", tenant)
        .single();
      if (eError || !empresa?.ruta_p12 || !empresa?.p12_password)
        throw Error("Empresa sin .p12 o contraseña registrada");
      const cert = await loadCertificate(
        db,
        empresa.ruta_p12,
        empresa.p12_password,
      );
      signed = await signXades(
        draft.xml,
        cert.privateKeyPem,
        cert.certPem,
        cert.certDer,
        cert.issuerName,
        cert.serialNumber,
      );
      result = await realSriFlow(signed, invoice.ambiente_sri);
      mensaje = result.authorized
        ? "Autorizada por el SRI"
        : "El SRI no autorizó el comprobante";
    } else {
      if (mode !== "simulation") throw Error("SRI_MODE inválido");
      signed = simulateSignature(draft.xml);
      const r = await simulateSoap(
        signed,
        id,
        Deno.env.get("SRI_SIMULATION_RESULT") !== "error",
      );
      result = r;
      mensaje = "SIMULACIÓN: no firmada criptográficamente ni enviada al SRI";
    }
    const { error: updateError } = await db
      .from("facturas_sri")
      .update({
        estado: result.authorized ? "Autorizada" : "Error",
        simulacion,
        clave_acceso: draft.key,
        xml_borrador: draft.xml,
        xml_firmado: signed,
        xml_autorizado: result.xml,
        numero_autorizacion: result.authorized ? result.number : null,
        fecha_autorizacion: result.authorized ? new Date().toISOString() : null,
        mensaje,
      })
      .eq("tenant_id", tenant)
      .eq("id", id)
      .eq("claim_token", claim)
      .eq("estado", "Procesando");
    if (updateError) throw Error("No se pudo guardar el resultado");
    return json({
      id,
      estado: result.authorized ? "Autorizada" : "Error",
      simulacion,
    });
  } catch {
    const { error } = await db
      .from("facturas_sri")
      .update({
        estado: "Error",
        mensaje: "Error al firmar/enviar al SRI. Revisión requerida.",
      })
      .eq("tenant_id", tenant)
      .eq("id", id)
      .eq("claim_token", claim)
      .eq("estado", "Procesando");
    return json(
      {
        id,
        error: error
          ? "No se pudo persistir el error; revisar factura"
          : "Simulación fallida",
      },
      500,
    );
  }
});
