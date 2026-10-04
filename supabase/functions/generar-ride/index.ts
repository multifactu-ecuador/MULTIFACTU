import { createClient } from "npm:@supabase/supabase-js@2";
import { generateRidePdf } from "../_shared/ride-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InvoiceRow {
  id: string;
  tenant_id: string;
  clave_acceso: string | null;
  numero_autorizacion: string | null;
  fecha_autorizacion: string | null;
  ambiente_sri: string;
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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: "No autorizado" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!url || !key) return json({ error: "Backend no configurado" }, 503);
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "Sesión no válida" }, 401);

  const body = await req.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return json({ error: "ID requerido" }, 400);

  const { data: profile, error: profileError } = await supabase
    .from("usuarios_perfiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || !profile) return json({ error: "Sin empresa asignada" }, 403);

  const { data: inv, error } = await supabase
    .from("facturas_sri")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (error || !inv) return json({ error: "Factura no encontrada" }, 404);

  const { data: det, error: detailsError } = await supabase
    .from("factura_detalles")
    .select("*")
    .eq("factura_id", id)
    .eq("tenant_id", profile.tenant_id);
  if (detailsError) return json({ error: "No se pudieron cargar los detalles" }, 500);
  const detalles = (det ?? []) as any[];

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
    numeroAutorizacion: invRow.numero_autorizacion ?? undefined,
    fechaAutorizacion: invRow.fecha_autorizacion ?? undefined,
  };

  try {
    const pdfBytes = await generateRidePdf(rideData);
    return new Response(pdfBytes as any, {
      headers: {
        "Content-Type": "application/pdf",
        ...corsHeaders,
        "Content-Disposition": `attachment; filename="RIDE-${accessKey.slice(0, 12)}.pdf"`,
      },
    });
  } catch (e) {
    console.error("Error generando RIDE:", e);
    return json({ error: "Error generando PDF" }, 500);
  }
});
