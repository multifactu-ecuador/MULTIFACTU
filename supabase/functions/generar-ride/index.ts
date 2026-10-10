import { createClient } from "npm:@supabase/supabase-js@2";
import { generateRidePdf } from "../_shared/ride-pdf.ts";
import { RUC_PROVEEDOR } from "../_shared/sri.ts";
import { guardar } from "../_shared/guard.ts";
import { acaoDe } from "../_shared/origen.ts";
import { verificarEntorno } from "../_shared/verificar.ts";

// Cabeceras CORS por petición: el navegador exige eco exacto del Origin,
// y APP_ORIGIN admite varios orígenes (transición de dominio).
const cabeceras = (req: Request) => ({
  "Access-Control-Allow-Origin": acaoDe(req),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

interface InvoiceRow {
  id: string;
  tenant_id: string;
  clave_acceso: string | null;
  numero_autorizacion: string | null;
  fecha_autorizacion: string | null;
  ambiente_sri: string;
  simulacion: boolean;
  establecimiento: string;
  punto_emision: string;
  secuencial: number;
  fecha: string;
  subtotal_0: number;
  subtotal_5: number;
  subtotal_15: number;
  descuentos: number;
  iva_5: number;
  iva_15: number;
  total: number;
  metodo_pago: string;
  credito_dias: number;
  emisor_snapshot: Record<string, string>;
  cliente_snapshot: Record<string, string>;
}

const json = (req: Request, data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cabeceras(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json(req, { error: "Backend no configurado" }, 503);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Denegar por defecto: origen, método y sesión de usuario en un solo punto.
  const ctx = await guardar(req, "/generar-ride", cabeceras(req), verificarEntorno);
  if (ctx instanceof Response) return ctx;

  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  // Mismo patrón que el resto de functions: sólo UUID válido, no cualquier
  // cadena (evita tráfico basura contra PostgREST).
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id) return json(req, { error: "ID requerido" }, 400);

  const { data: inv, error } = await supabase
    .from("facturas_sri")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", ctx.tenant)
    .maybeSingle();
  if (error || !inv) return json(req, { error: "Factura no encontrada" }, 404);

  const { data: det, error: detailsError } = await supabase
    .from("factura_detalles")
    .select("*")
    .eq("factura_id", id)
    .eq("tenant_id", ctx.tenant);
  if (detailsError) return json(req, { error: "No se pudieron cargar los detalles" }, 500);
  const detalles = (det ?? []) as any[];

  // Datos fiscales vigentes del emisor para las leyendas de régimen del
  // RIDE (Anexos 21 y 22) y el campo RUC Proveedor (Anexo 26), los mismos
  // valores que el XML emite en infoTributaria/infoAdicional.
  const { data: empresa } = await supabase
    .from("empresas")
    .select(
      "regimen, obligado_contabilidad, agente_retencion, contribuyente_especial",
    )
    .eq("id", ctx.tenant)
    .maybeSingle();

  const invRow = inv as InvoiceRow;
  const emisor = invRow.emisor_snapshot ?? {};
  const cliente = invRow.cliente_snapshot ?? {};
  const accessKey = invRow.clave_acceso ?? "0".repeat(49);

  const rideData = {
    ruc: emisor.ruc ?? "9999999999999",
    razonSocial: emisor.razon_social ?? "SIN RAZÓN SOCIAL",
    nombreComercial: emisor.nombre_comercial ?? emisor.razon_social ?? "SIN NOMBRE",
    direccionMatriz: emisor.direccion ?? "SIN DIRECCIÓN",
    direccionEstablecimiento: emisor.direccion ?? "SIN DIRECCIÓN",
    regimen: empresa?.regimen ?? "general",
    obligadoContabilidad: empresa?.obligado_contabilidad === true,
    agenteRetencion: empresa?.agente_retencion ?? undefined,
    contribuyenteEspecial: empresa?.contribuyente_especial ?? undefined,
    rucProveedor: RUC_PROVEEDOR || undefined,
    ambiente: (invRow.ambiente_sri === "pruebas" ? "1" : "2") as "1" | "2",
    tipoComprobante: "01" as const,
    establecimiento: invRow.establecimiento,
    puntoEmision: invRow.punto_emision,
    secuencial: invRow.secuencial,
    fechaEmision: invRow.fecha.split("-").reverse().join("/"),
    claveAcceso: accessKey,
    tipoIdentificacionComprador: cliente.tipo_id ?? "04",
    identificacionComprador: cliente.identificacion ?? "9999999999999",
    razonSocialComprador: cliente.nombre ?? "CONSUMIDOR FINAL",
    direccionComprador: cliente.direccion ?? undefined,
    emailComprador: cliente.email ?? undefined,
    subtotal0: invRow.subtotal_0 ?? 0,
    subtotal5: invRow.subtotal_5 ?? 0,
    subtotal15: invRow.subtotal_15 ?? 0,
    subtotalNoObjetoIva: 0,
    descuento: invRow.descuentos ?? 0,
    ice: 0,
    iva0: 0,
    iva5: invRow.iva_5 ?? 0,
    iva15: invRow.iva_15 ?? 0,
    ivaNoObjeto: 0,
    propina: 0,
    importeTotal: invRow.total ?? 0,
    moneda: "DOLAR" as "DOLAR",
    detalles: detalles.map((d, i) => ({
      codigoPrincipal: d.catalogo_id?.slice(0, 20) ?? `ITEM-${i + 1}`,
      descripcion: d.descripcion,
      cantidad: Number(d.cantidad ?? 1),
      precioUnitario: Number(d.precio ?? 0),
      descuento: Number(d.descuento ?? 0),
      precioTotalSinImpuesto: Number(d.base ?? 0),
      iva: Number(d.iva ?? 0) as 0 | 5 | 15,
    })),
    formasPago: [{
      formaPago: invRow.metodo_pago,
      total: Number(invRow.total ?? 0),
      ...(invRow.credito_dias > 0 ? { plazo: invRow.credito_dias, unidadTiempo: "dias" } : {}),
    }],
    numeroAutorizacion: invRow.simulacion ? undefined : invRow.numero_autorizacion ?? undefined,
    fechaAutorizacion: invRow.fecha_autorizacion ?? undefined,
  };

  try {
    const pdfBytes = await generateRidePdf(rideData);
    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        ...cabeceras(req),
        "Content-Disposition": `attachment; filename="RIDE-${accessKey.slice(0, 12)}.pdf"`,
      },
    });
  } catch (e) {
    console.error("Error generando RIDE:", e);
    return json(req, { error: "Error generando PDF" }, 500);
  }
});
