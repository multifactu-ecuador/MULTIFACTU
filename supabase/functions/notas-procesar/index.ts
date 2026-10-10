import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  generateCreditNoteXml,
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
Deno.serve(async (req) => {
  // Denegar por defecto: ruta registrada, origen y secreto compartido.
  const ctx = await guardar(req, "/notas-procesar");
  if (ctx instanceof Response) return ctx;
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
    const nota = claimed as Record<string, unknown> & {
      id: string;
      factura_id: string;
      clave_acceso?: string | null;
      xml_borrador?: string | null;
    };
    const { data: factura, error: fErr } = await db
      .from("facturas_sri")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("id", nota.factura_id)
      .single();
    if (fErr || !factura) throw Error("Factura base no encontrada");
    // En modo real jamás se emite una NC sobre una factura simulada: ese
    // comprobante no existe en el SRI. En simulación el flujo de prueba
    // sigue permitido (crear_nota_credito no conoce el modo).
    if (mode === "real" && factura.simulacion === true)
      throw Error("Factura base simulada: no puede creditarse en modo real");
    const { data: lines, error: lErr } = await db
      .from("factura_detalles")
      .select("*")
      .eq("tenant_id", tenant)
      .eq("factura_id", nota.factura_id)
      .order("id");
    if (lErr || !lines?.length) throw Error("Detalles no disponibles");
    // Datos fiscales vigentes del emisor (régimen, contabilidad, agente de
    // retención y contribuyente especial) justo antes de armar el XML de la
    // nota; el snapshot de la factura vieja no trae los dos últimos.
    const { data: empresa } = await db
      .from("empresas")
      .select(
        "ruta_p12, regimen, obligado_contabilidad, agente_retencion, contribuyente_especial",
      )
      .eq("id", tenant)
      .maybeSingle();
    if (empresa)
      factura.emisor_snapshot = {
        ...factura.emisor_snapshot,
        regimen: empresa.regimen,
        obligado_contabilidad: empresa.obligado_contabilidad,
        agente_retencion: empresa.agente_retencion,
        contribuyente_especial: empresa.contribuyente_especial,
      };
    // Misma disciplina que sri-procesar: clave y XML se persisten antes del
    // primer envío y un reintento reutiliza la misma clave (unique).
    let draft: { key: string; xml: string };
    if (nota.clave_acceso && nota.xml_borrador) {
      draft = { key: nota.clave_acceso, xml: nota.xml_borrador };
    } else {
      const code = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 100000000,
      ).padStart(8, "0");
      draft = generateCreditNoteXml(
        nota as unknown as Parameters<typeof generateCreditNoteXml>[0],
        factura as unknown as SriInvoice & { clave_acceso: string; fecha: string },
        lines as SriLine[],
        String(nota.motivo ?? ""),
        code,
      );
      const { data: persisted, error: persistError } = await db
        .from("notas_credito")
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
      result: {
        estado: "AUTORIZADO" | "NO_AUTORIZADO" | "EN_PROCESADO";
        authorized: boolean;
        xml: string;
        number: string | null;
      },
      simulacion = mode !== "real",
      mensaje: string;
    if (mode === "real") {
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
      signed = await signXades(draft.xml, cert.privateKeyPem, cert.certPem, cert.certDer, cert.issuerName, cert.serialNumber);
      result = await realSriFlow(signed, (nota.ambiente_sri as "pruebas" | "produccion") ?? "pruebas");
      mensaje =
        result.estado === "AUTORIZADO"
          ? "Nota de crédito autorizada por el SRI"
          : result.estado === "EN_PROCESADO"
            ? "En cola de autorización del SRI (nota de crédito)"
            : "El SRI no autorizó la nota de crédito";
    } else {
      if (mode !== "simulation") throw Error("SRI_MODE inválido");
      signed = simulateSignature(draft.xml);
      const r = await simulateSoap(signed, id, Deno.env.get("SRI_SIMULATION_RESULT") !== "error");
      result = { ...r, estado: r.authorized ? "AUTORIZADO" : "NO_AUTORIZADO" };
      mensaje = "Nota de crédito no firmada ni enviada al SRI";
    }
    // EN PROCESADO no es un fallo: el SRI sigue procesando la nota. Se deja
    // en 'Procesando' y el cron multifactu-reintentar-emision la re-dispara
    // con la misma clave de acceso pasados 15 minutos.
    if (result.estado === "EN_PROCESADO") {
      await db
        .from("notas_credito")
        .update({ mensaje })
        .eq("tenant_id", tenant)
        .eq("id", id)
        .eq("claim_token", claim)
        .eq("estado", "Procesando");
      return json({ id, estado: "EN_PROCESADO", simulacion });
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
  } catch (e) {
    console.error(
      "notas-procesar: fallo de emisión",
      e instanceof Error ? e.message : String(e),
    );
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
