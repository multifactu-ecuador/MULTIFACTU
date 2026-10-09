import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  generateXml,
  simulateSignature,
  simulateSoap,
  type SriInvoice,
  type SriLine,
} from "../_shared/sri.ts";
import { loadCertificate, realSriFlow, signXades } from "../_shared/sri-real.ts";
import { guardar } from "../_shared/guard.ts";
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
Deno.serve(async (req) => {
  // Denegar por defecto: ruta registrada, origen y secreto compartido.
  const ctx = await guardar(req, "/sri-procesar");
  if (ctx instanceof Response) return ctx;
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
    const invoice = claimed as SriInvoice & {
      clave_acceso?: string | null;
      xml_borrador?: string | null;
    };
    const { data: lines, error } = await db
      .from("factura_detalles")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("factura_id", id)
      .order("id");
    if (error || !lines?.length) throw Error("Detalles no disponibles");
    // Datos fiscales vigentes del emisor: el snapshot de la factura no trae
    // agente de retención ni contribuyente especial (columnas nuevas), y el
    // régimen/contabilidad se leen aquí para que el XML refleje lo vigente
    // al momento de emitir. Si la consulta falla se usa sólo el snapshot.
    const { data: empresa } = await db
      .from("empresas")
      .select(
        "ruta_p12, regimen, obligado_contabilidad, agente_retencion, contribuyente_especial",
      )
      .eq("id", tenant)
      .maybeSingle();
    if (empresa)
      invoice.emisor_snapshot = {
        ...invoice.emisor_snapshot,
        regimen: empresa.regimen,
        obligado_contabilidad: empresa.obligado_contabilidad,
        agente_retencion: empresa.agente_retencion,
        contribuyente_especial: empresa.contribuyente_especial,
      };
    // Clave de acceso y XML se persisten ANTES del primer envío: un
    // reintento reutiliza la misma clave (la columna es unique) en vez de
    // generar otra, y si perdimos la reclamación se aborta antes de firmar.
    let draft: { key: string; xml: string };
    if (invoice.clave_acceso && invoice.xml_borrador) {
      draft = { key: invoice.clave_acceso, xml: invoice.xml_borrador };
    } else {
      const code = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 100000000,
      ).padStart(8, "0");
      draft = generateXml(invoice, lines as SriLine[], code);
      const { data: persisted, error: persistError } = await db
        .from("facturas_sri")
        .update({ clave_acceso: draft.key, xml_borrador: draft.xml })
        .eq("tenant_id", tenant)
        .eq("id", id)
        .eq("claim_token", claim)
        .eq("estado", "Procesando")
        .select("id")
        .maybeSingle();
      if (persistError || !persisted)
        throw Error("Reclamación perdida; no se emite");
    }
    let signed: string,
      result: { authorized: boolean; xml: string; number: string | null },
      simulacion = mode !== "real",
      mensaje: string;
    if (mode === "real") {
      // Ruta real: .p12 de la empresa + firma XAdES + SOAP al SRI.
      // La fila de la empresa ya se cargó antes de generar el XML.
      if (!empresa?.ruta_p12)
        throw Error("Empresa sin .p12 registrado");
      // Contraseña cifrada en Vault: sólo service_role puede descifrarla.
      const { data: p12Password, error: pwError } = await db.rpc(
        "leer_p12_password",
        { p_tenant: tenant },
      );
      if (pwError || !p12Password)
        throw Error("Empresa sin contraseña de .p12 registrada");
      const cert = await loadCertificate(db, empresa.ruta_p12, p12Password);
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
      mensaje = "No firmada criptográficamente ni enviada al SRI";
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
          : "Error de emisión",
      },
      500,
    );
  }
});
