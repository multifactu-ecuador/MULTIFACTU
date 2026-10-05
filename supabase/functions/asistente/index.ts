// Asistente de reportes comerciales: interpreta la pregunta en español con un
// motor de intenciones y responde con cifras reales del tenant (facturas,
// cuotas, movimientos y catálogo). Sólo ADMIN. Si más adelante se conecta un
// LLM, este contrato (pregunta → respuesta con datos) se mantiene.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { CONOCIMIENTO_SISTEMA, preguntarNvidia } from "../_shared/system-knowledge.ts";
import { guardar } from "../_shared/guard.ts";
import { verificarEntorno } from "../_shared/verificar.ts";
import {
  memoriaTexto,
  proponerHallazgos,
  type DatosTenant,
} from "../_shared/rufo-learning.ts";

const money = (v: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(v);
const hoyEcuador = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());

type Db = SupabaseClient;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[¿?¡!.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function ventasMes(db: Db, tenant: string) {
  const esteMes = hoyEcuador().slice(0, 7);
  const mesAnteriorDate = new Date();
  mesAnteriorDate.setMonth(mesAnteriorDate.getMonth() - 1);
  const mesAnterior = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(mesAnteriorDate).slice(0, 7);
  const { data } = await db
    .from("facturas_sri")
    .select("fecha,total")
    .eq("tenant_id", tenant)
    .eq("estado", "Autorizada")
    .gte("fecha", mesAnterior + "-01");
  const rows = (data ?? []) as Array<{ fecha: string; total: number }>;
  const sum = (mes: string) =>
    rows
      .filter((f) => String(f.fecha).startsWith(mes))
      .reduce((s, f) => s + Number(f.total), 0);
  const actual = sum(esteMes), pasado = sum(mesAnterior);
  if (!rows.length)
    return "Aún no tienes facturas autorizadas para comparar. Cuando emitas tus primeras ventas, aquí compararé tus meses.";
  const dif = actual - pasado;
  const tendencia =
    pasado === 0
      ? "el mes pasado no hubo ventas autorizadas"
      : dif >= 0
        ? `un ${((dif / pasado) * 100).toFixed(1)}% más que el mes pasado`
        : `un ${((-dif / pasado) * 100).toFixed(1)}% menos que el mes pasado`;
  return `Este mes llevas ${money(actual)} en ventas autorizadas; el mes pasado fueron ${money(pasado)}: ${tendencia}. (Base: tus facturas en estado Autorizada.)`;
}

async function topDeudores(db: Db, tenant: string) {
  const { data } = await db
    .from("saldos_clientes")
    .select("nombre,saldo_credito")
    .eq("tenant_id", tenant)
    .gt("saldo_credito", 0)
    .order("saldo_credito", { ascending: false })
    .limit(3);
  const rows = (data ?? []) as Array<{ nombre: string; saldo_credito: number }>;
  if (!rows.length)
    return "Buenas noticias: ningún cliente tiene saldo pendiente por pagar ahora mismo.";
  const lista = rows
    .map((c, i) => `${i + 1}. ${c.nombre}: ${money(Number(c.saldo_credito))}`)
    .join(" · ");
  const total = rows.reduce((s, c) => s + Number(c.saldo_credito), 0);
  return `Tus ${rows.length} clientes que más te deben son: ${lista}. Entre los tres suman ${money(total)} por cobrar.`;
}

async function productoVendido(db: Db, tenant: string, mejor: boolean) {
  const { data } = await db
    .from("factura_detalles")
    .select("descripcion,cantidad,facturas_sri!inner(estado,tenant_id)")
    .eq("tenant_id", tenant)
    .eq("facturas_sri.estado", "Autorizada");
  const rows = (data ?? []) as Array<{ descripcion: string; cantidad: number }>;
  if (!rows.length)
    return "Todavía no hay ventas autorizadas para medir el movimiento de tus ítems.";
  const porItem = new Map<string, number>();
  for (const d of rows) {
    const key = String(d.descripcion);
    porItem.set(key, (porItem.get(key) ?? 0) + Number(d.cantidad));
  }
  const ordenados = [...porItem.entries()].sort((a, b) => a[1] - b[1]);
  const [nombre, cantidad] = mejor ? ordenados[ordenados.length - 1] : ordenados[0];
  return mejor
    ? `Tu ítem más vendido es "${nombre}" con ${cantidad} unidades en facturas autorizadas.`
    : `El ítem que menos se mueve es "${nombre}" con apenas ${cantidad} unidades vendidas. Quizá convenga revisar su precio o promocionarlo.`;
}

async function gastosMes(db: Db, tenant: string) {
  const mes = hoyEcuador().slice(0, 7);
  const { data } = await db
    .from("movimientos_caja")
    .select("monto")
    .eq("tenant_id", tenant)
    .eq("tipo", "EGRESO")
    .gte("fecha", mes + "-01");
  const rows = (data ?? []) as Array<{ monto: number }>;
  const total = rows.reduce((s, m) => s + Number(m.monto), 0);
  return `Este mes llevas ${money(total)} en egresos registrados (${rows.length} movimientos de caja).`;
}

async function cajaHoy(db: Db, tenant: string) {
  const hoy = hoyEcuador();
  const { data } = await db
    .from("movimientos_caja")
    .select("tipo,monto")
    .eq("tenant_id", tenant)
    .eq("fecha", hoy);
  const rows = (data ?? []) as Array<{ tipo: string; monto: number }>;
  const neto = rows.reduce(
    (s, m) => s + (["INGRESO", "GARANTIA"].includes(m.tipo) ? Number(m.monto) : -Number(m.monto)),
    0,
  );
  return `Hoy (${hoy}) tu caja registra ${money(neto)} netos en ${rows.length} movimientos. Recuerda cerrar la caja al final del día desde Finanzas.`;
}

async function stockBajo(db: Db, tenant: string) {
  const { data } = await db
    .from("catalogo_maquinaria")
    .select("nombre,stock")
    .eq("tenant_id", tenant)
    .eq("tipo", "PRODUCTO")
    .lte("stock", 3)
    .order("stock")
    .limit(5);
  const rows = (data ?? []) as Array<{ nombre: string; stock: number }>;
  if (!rows.length) return "Tu inventario está sano: ningún producto tiene 3 o menos unidades en stock.";
  return `Ojo con el stock bajo: ${rows.map((p) => `${p.nombre} (${p.stock})`).join(", ")}. Conviene reabastecer pronto.`;
}

async function cuotasVencidas(db: Db, tenant: string) {
  const hoy = hoyEcuador();
  const { data } = await db
    .from("cuotas")
    .select("monto,pagado")
    .eq("tenant_id", tenant)
    .lt("vencimiento", hoy);
  const pendientes = ((data ?? []) as Array<{ monto: number; pagado: number }>).filter(
    (c) => Number(c.pagado) < Number(c.monto),
  );
  const total = pendientes.reduce((s, c) => s + Number(c.monto) - Number(c.pagado), 0);
  if (!pendientes.length) return "No tienes cuotas vencidas: tu cartera está al día. 🎉";
  return `Tienes ${pendientes.length} cuotas vencidas por un total de ${money(total)}. Te conviene gestionar esos cobros esta semana.`;
}

async function ventasHoy(db: Db, tenant: string) {
  const hoy = hoyEcuador();
  const { data } = await db
    .from("facturas_sri")
    .select("total")
    .eq("tenant_id", tenant)
    .eq("estado", "Autorizada")
    .eq("fecha", hoy);
  const rows = (data ?? []) as Array<{ total: number }>;
  const total = rows.reduce((s, f) => s + Number(f.total), 0);
  return `Hoy has autorizado ${rows.length} comprobantes por ${money(total)}.`;
}

// --- Aprendizaje de RUFO: analiza, propone y recuerda por empresa ---
const UNA_SEMANA = 7 * 24 * 3600 * 1000;
const HISTORIAL_DIAS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function datosAprendizaje(db: Db, tenant: string): Promise<DatosTenant> {
  const desde = new Date(Date.now() - HISTORIAL_DIAS * 86400000).toISOString().slice(0, 10);
  const [facturas, movimientos, cuotas, productos, deudores] = await Promise.all([
    db.from("facturas_sri").select("fecha,total").eq("tenant_id", tenant).eq("estado", "Autorizada").gte("fecha", desde),
    db.from("movimientos_caja").select("fecha,tipo,monto").eq("tenant_id", tenant).gte("fecha", desde),
    db.from("cuotas").select("monto,pagado,vencimiento").eq("tenant_id", tenant).gte("vencimiento", desde),
    db.from("catalogo_maquinaria").select("nombre,stock").eq("tenant_id", tenant).eq("tipo", "PRODUCTO").lte("stock", 3).limit(20),
    db.from("saldos_clientes").select("nombre,saldo_credito").eq("tenant_id", tenant).gt("saldo_credito", 0).order("saldo_credito", { ascending: false }).limit(10),
  ]);
  return {
    hoy: hoyEcuador(),
    facturas: (facturas.data ?? []) as DatosTenant["facturas"],
    movimientos: (movimientos.data ?? []) as DatosTenant["movimientos"],
    cuotas: (cuotas.data ?? []) as DatosTenant["cuotas"],
    productos: (productos.data ?? []) as DatosTenant["productos"],
    deudores: ((deudores.data ?? []) as Array<{ nombre: string; saldo_credito: unknown }>)
      .map((d) => ({ nombre: d.nombre, saldo: Number(d.saldo_credito) })),
  };
}

// Analiza como máximo una vez por semana; la primera vez, con la primera
// pregunta. Todo lo propuesto pasa por Confirmar/Descartar del ADMIN.
async function asegurarAprendizaje(db: Db, tenant: string): Promise<void> {
  const { data: control } = await db
    .from("rufo_control")
    .select("ultimo_analisis")
    .eq("tenant_id", tenant)
    .maybeSingle();
  if (
    control?.ultimo_analisis &&
    Date.now() - new Date(String(control.ultimo_analisis)).getTime() < UNA_SEMANA
  )
    return;
  const hallazgos = proponerHallazgos(await datosAprendizaje(db, tenant));
  if (hallazgos.length)
    await db
      .from("rufo_aprendizaje")
      .upsert(
        hallazgos.map((h) => ({ ...h, tenant_id: tenant })),
        { onConflict: "tenant_id,clave,periodo", ignoreDuplicates: true },
      );
  await db
    .from("rufo_control")
    .upsert(
      { tenant_id: tenant, ultimo_analisis: new Date().toISOString() },
      { onConflict: "tenant_id" },
    );
}

async function memoriaDe(db: Db, tenant: string) {
  const { data } = await db
    .from("rufo_memoria")
    .select("clave,valor")
    .eq("tenant_id", tenant)
    .eq("activo", true)
    .order("creado_en", { ascending: false })
    .limit(40);
  return (data ?? []) as Array<{ clave: string; valor: string }>;
}

// Cifras de referencia del mes que acompañan a la respuesta del modelo.
async function resumenNegocio(db: Db, tenant: string): Promise<string> {
  const mes = hoyEcuador().slice(0, 7);
  const [ventas, saldos, vencidas, egresos] = await Promise.all([
    db.from("facturas_sri").select("total").eq("tenant_id", tenant).eq("estado", "Autorizada").gte("fecha", `${mes}-01`),
    db.from("saldos_clientes").select("saldo_credito").eq("tenant_id", tenant).gt("saldo_credito", 0),
    db.from("cuotas").select("monto,pagado").eq("tenant_id", tenant).lt("vencimiento", hoyEcuador()),
    db.from("movimientos_caja").select("monto").eq("tenant_id", tenant).eq("tipo", "EGRESO").gte("fecha", `${mes}-01`),
  ]);
  const suma = (filas: Array<Record<string, unknown>> | null, campo: string) =>
    (filas ?? []).reduce((s, f) => s + Number(f[campo] ?? 0), 0);
  const pendientes = ((vencidas.data ?? []) as Array<{ monto: number; pagado: number }>)
    .filter((c) => Number(c.pagado) < Number(c.monto));
  const vencido = pendientes.reduce((s, c) => s + Number(c.monto) - Number(c.pagado), 0);
  return `Mes en curso (${mes}): ventas autorizadas ${money(suma(ventas.data as Array<Record<string, unknown>> | null, "total"))} · por cobrar ${money(suma(saldos.data as Array<Record<string, unknown>> | null, "saldo_credito"))} · cuotas vencidas ${money(vencido)} · egresos del mes ${money(suma(egresos.data as Array<Record<string, unknown>> | null, "monto"))}.`;
}

const AYUDA =
  "Puedo analizar tus datos y responderte sobre: ventas del mes y comparación («¿cuánto vendí este mes?»), clientes que más te deben, productos más y menos vendidos, gastos del mes, caja de hoy, stock bajo, cuotas vencidas y ventas de hoy. ¿Qué quieres saber?";

// El "entrenamiento" en tiempo de ejecución: conocimiento fijo + memoria del
// negocio (propia de este tenant) + cifras del mes + la regla de ayudar a
// decidir sin decidir ni ejecutar nada.
function sistemaConContexto(
  memoria: Array<{ clave: string; valor: string }>,
  resumen: string,
): string {
  return `${CONOCIMIENTO_SISTEMA}

## Este negocio (memoria propia de esta empresa)
${memoriaTexto(memoria)}

## Cifras de referencia
${resumen}

## Cómo ayudas a decidir
Ayudas a tomar decisiones; no las tomes ni las ejecutes. Presenta 2 u 3 opciones con sus cifras, ventajas y riesgos, y deja la decisión al usuario. Nunca emitas, cobres, borres ni cambies nada del sistema: si te lo piden, explica el paso a paso para que lo haga el usuario.`;
}

async function responder(db: Db, tenant: string, pregunta: string): Promise<string> {
  const q = normalizar(pregunta);
  if (!q) return AYUDA;
  // Preguntas de navegación/uso ("¿cómo veo mis facturas?") van directo a
  // RUFO con el conocimiento del sistema: el motor de datos no aplica.
  const esComo =
    /\b(como|donde|dónde|puedo|debo|hago|muestro|veo|descargo|subo|cargo|configuro|encontrar|pasos|que es|para que sirve|explica)\b/.test(
      q,
    ) &&
    /\b(veo|ver|descargo|encuentro|reviso|subo|cargo|creo|hago|agrego|elimino|registro|facturas|clientes|productos|servicios|inventario|reportes|planes|firma|p12|cotizaci|proforma|pagos|cobros|gastos|caja|stock|cuotas|ayuda)\b/.test(
      q,
      );
  if (!esComo) {
    if (/deben|deuda|por cobrar|cartera|me deben/.test(q)) return topDeudores(db, tenant);
    if (/menos vend|peor|no se vende|menos se vende/.test(q)) return productoVendido(db, tenant, false);
    if (/mas vend|mejor producto|top|mas se vende/.test(q)) return productoVendido(db, tenant, true);
    if (/vencid|mora|atrasad/.test(q)) return cuotasVencidas(db, tenant);
    if (/stock|inventario|agotad/.test(q)) return stockBajo(db, tenant);
    if (/gasto|egreso|gaste/.test(q)) return gastosMes(db, tenant);
    if (/caja|efectivo|cierre/.test(q)) return cajaHoy(db, tenant);
    if (/hoy/.test(q) && /vend|venta|factur/.test(q)) return ventasHoy(db, tenant);
    if (/\b(cuanto|ventas|vendi|vendio|ingresos|facturado|facturacion)\b/.test(q)) return ventasMes(db, tenant);
  }
  if (/ayuda|que puedes|hola|buenas/.test(q)) return AYUDA;
  // Fuera de las intenciones de datos: la IA entrenada con el conocimiento
  // del sistema responde dudas de uso, planes y flujos. Si no está
  // disponible, respaldo con la ayuda fija.
  const [memoria, resumen] = await Promise.all([
    memoriaDe(db, tenant),
    resumenNegocio(db, tenant),
  ]);
  const ia = await preguntarNvidia([
    { role: "system", content: sistemaConContexto(memoria, resumen) },
    { role: "user", content: pregunta.slice(0, 500) },
  ]);
  if (ia) return ia;
  return `No estoy seguro de entender esa pregunta. ${AYUDA}`;
}

Deno.serve(async (req) => {
  const origin = Deno.env.get("APP_ORIGIN")?.replace(/\/$/, "");
  const cors = {
    "Access-Control-Allow-Origin": origin ?? "http://localhost:5173",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret || !origin) return json({ error: "Servicio no configurado" }, 503);
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Denegar por defecto + sesión + rol ADMIN en un solo punto.
  const ctx = await guardar(req, "/asistente", cors, verificarEntorno);
  if (ctx instanceof Response) return ctx;

  let body: Record<string, unknown> | null = null;
  try {
    const crudo: unknown = await req.json();
    body = crudo && typeof crudo === "object" ? (crudo as Record<string, unknown>) : null;
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body) return json({ error: "JSON inválido" }, 400);

  try {
    // Acciones de aprendizaje: estado, revisión de hallazgos, memoria y feedback.
    if (typeof body.accion === "string") {
      const r = await gestionar(admin, ctx.tenant, body);
      return json(r.data, r.status);
    }
    const pregunta = typeof body.pregunta === "string" ? body.pregunta.slice(0, 300) : "";
    if (!pregunta.trim()) return json({ error: "Escribe tu pregunta" }, 400);
    // Análisis semanal perezoso: nunca frena la respuesta del usuario.
    await asegurarAprendizaje(admin, ctx.tenant).catch((e) =>
      console.error(JSON.stringify({ fn: "asistente.aprendizaje", error: String(e) })),
    );
    const respuesta = await responder(admin, ctx.tenant, pregunta);
    return json({ respuesta });
  } catch (e) {
    console.error(JSON.stringify({ fn: "asistente", error: String(e) }));
    return json({ error: "No pude analizar tus datos en este momento" }, 500);
  }
});

// Acciones del ciclo de aprendizaje. El navegador sólo lee (RLS de ADMIN);
// escribir aquí es exclusivo del service role. Todo queda ligado al tenant.
type Resultado = { data: Record<string, unknown>; status: number };

async function gestionar(
  db: Db,
  tenant: string,
  body: Record<string, unknown>,
): Promise<Resultado> {
  const accion = String(body.accion);

  if (accion === "estado") {
    const [propuestas, memoria] = await Promise.all([
      db.from("rufo_aprendizaje")
        .select("id,clave,tipo,titulo,detalle,periodo,creado_en")
        .eq("tenant_id", tenant)
        .eq("estado", "propuesto")
        .order("creado_en", { ascending: false })
        .limit(6),
      db.from("rufo_memoria")
        .select("id,clave,valor,origen,creado_en")
        .eq("tenant_id", tenant)
        .eq("activo", true)
        .order("creado_en", { ascending: false })
        .limit(20),
    ]);
    if (propuestas.error || memoria.error)
      return { data: { error: "No pude cargar el aprendizaje" }, status: 500 };
    return {
      data: { propuestas: propuestas.data ?? [], memoria: memoria.data ?? [] },
      status: 200,
    };
  }

  if (accion === "revisar") {
    const decision =
      body.decision === "confirmar" ? "confirmado"
      : body.decision === "descartar" ? "descartado"
      : null;
    const id = typeof body.id === "string" ? body.id : "";
    if (!decision || !UUID.test(id))
      return { data: { error: "Revisión inválida" }, status: 400 };
    const { data: propuesta } = await db
      .from("rufo_aprendizaje")
      .select("id,tipo,titulo,detalle")
      .eq("tenant_id", tenant)
      .eq("id", id)
      .eq("estado", "propuesto")
      .maybeSingle();
    if (!propuesta) return { data: { error: "Propuesta no encontrada" }, status: 404 };
    const { error } = await db
      .from("rufo_aprendizaje")
      .update({ estado: decision, revisado_en: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenant);
    if (error) return { data: { error: "No se pudo actualizar" }, status: 500 };
    // Confirmar un hallazgo lo convierte en memoria que RUFO usará después.
    if (decision === "confirmado")
      await db.from("rufo_memoria").upsert(
        {
          tenant_id: tenant,
          clave: propuesta.tipo,
          valor: `${propuesta.titulo}: ${propuesta.detalle}`,
          origen: "aprendido",
        },
        { onConflict: "tenant_id,clave,valor", ignoreDuplicates: true },
      );
    return { data: { ok: true }, status: 200 };
  }

  if (accion === "olvidar") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!UUID.test(id)) return { data: { error: "Identificador inválido" }, status: 400 };
    const { error } = await db
      .from("rufo_memoria")
      .update({ activo: false })
      .eq("id", id)
      .eq("tenant_id", tenant);
    if (error) return { data: { error: "No se pudo olvidar" }, status: 500 };
    return { data: { ok: true }, status: 200 };
  }

  if (accion === "perfil") {
    const valor = String(body.valor ?? "").trim().slice(0, 200);
    if (!valor)
      return { data: { error: "Escribe el dato que quieres que recuerde" }, status: 400 };
    const { error } = await db.from("rufo_memoria").upsert(
      { tenant_id: tenant, clave: "perfil", valor, origen: "declarado" },
      { onConflict: "tenant_id,clave,valor", ignoreDuplicates: true },
    );
    if (error) return { data: { error: "No se guardó el recuerdo" }, status: 500 };
    return { data: { ok: true }, status: 200 };
  }

  if (accion === "feedback") {
    const pregunta = typeof body.pregunta === "string" ? body.pregunta.slice(0, 300) : "";
    const respuesta = typeof body.respuesta === "string" ? body.respuesta.slice(0, 1500) : "";
    const util = typeof body.util === "boolean" ? body.util : null;
    if (!pregunta || !respuesta || util === null)
      return { data: { error: "Valoración incompleta" }, status: 400 };
    const { error } = await db
      .from("rufo_feedback")
      .insert({ tenant_id: tenant, pregunta, respuesta, util });
    if (error) return { data: { error: "No se guardó tu valoración" }, status: 500 };
    return { data: { ok: true }, status: 200 };
  }

  return { data: { error: "Acción no reconocida" }, status: 400 };
}
