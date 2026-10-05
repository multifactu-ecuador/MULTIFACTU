import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";

const RUC = /^\d{13}$/;
const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const MAX_RESPONSE_BYTES = 512 * 1024;

type RegimenInterno = "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";

interface Establishment {
  nombreFantasiaComercial?: unknown;
  tipoEstablecimiento?: unknown;
  direccionCompleta?: unknown;
  estado?: unknown;
  numeroEstablecimiento?: unknown;
  matriz?: unknown;
}

interface RucProviderResponse {
  numeroRuc?: unknown;
  razonSocial?: unknown;
  estadoContribuyenteRuc?: unknown;
  tipoGasto?: unknown;
  actividadEconomicaPrincipal?: unknown;
  ciiu?: unknown;
  tipoContribuyente?: unknown;
  regimen?: unknown;
  categoria?: unknown;
  obligadoLlevarContabilidad?: unknown;
  agenteRetencion?: unknown;
  contribuyenteEspecial?: unknown;
  contribuyenteFantasma?: unknown;
  transaccionesInexistente?: unknown;
  fechaUltimaActualizacion?: unknown;
  establecimientos?: unknown;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const yes = (value: unknown) => text(value).toUpperCase() === "SI";

function internalRegime(regimen: string, categoria: string): RegimenInterno {
  const value = `${regimen} ${categoria}`.toUpperCase();
  if (value.includes("RIMPE") && value.includes("NEGOCIO POPULAR"))
    return "rimpe_negocio_popular";
  if (value.includes("RIMPE") && value.includes("EMPRENDEDOR"))
    return "rimpe_emprendedor";
  return "general";
}

function normalize(payload: unknown, requestedRuc: string) {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  const raw = root?.data && typeof root.data === "object" ? root.data : root;
  if (!raw || typeof raw !== "object") throw Error("Respuesta fiscal inválida");
  const source = raw as RucProviderResponse;
  const ruc = text(source.numeroRuc);
  if (ruc !== requestedRuc) throw Error("La respuesta no corresponde al RUC consultado");
  const estado = text(source.estadoContribuyenteRuc).toUpperCase();
  const regimenSri = text(source.regimen);
  const categoria = text(source.categoria);
  const establishments = Array.isArray(source.establecimientos)
    ? source.establecimientos.filter((item): item is Establishment => !!item && typeof item === "object")
    : [];
  const open = establishments.filter((item) => text(item.estado).toUpperCase() === "ABIERTO");
  const establishment = open.find((item) => yes(item.matriz)) ?? open[0] ?? null;
  const warnings: string[] = [];
  if (estado !== "ACTIVO") warnings.push(`El RUC reporta estado ${estado || "DESCONOCIDO"}.`);
  if (yes(source.contribuyenteFantasma)) warnings.push("El contribuyente consta como fantasma.");
  if (yes(source.transaccionesInexistente)) warnings.push("El contribuyente registra transacciones inexistentes.");
  if (!establishment) warnings.push("No se encontró un establecimiento abierto.");

  return {
    ruc,
    razonSocial: text(source.razonSocial),
    estadoContribuyente: estado,
    activo: estado === "ACTIVO",
    tipoContribuyente: text(source.tipoContribuyente),
    actividadEconomicaPrincipal: text(source.actividadEconomicaPrincipal),
    ciiu: text(source.ciiu),
    tipoGasto: text(source.tipoGasto),
    regimenSri,
    categoria,
    regimen: internalRegime(regimenSri, categoria),
    obligadoContabilidad: yes(source.obligadoLlevarContabilidad),
    agenteRetencion: yes(source.agenteRetencion),
    contribuyenteEspecial: yes(source.contribuyenteEspecial),
    actualizadoEn: text(source.fechaUltimaActualizacion) || null,
    establecimiento: establishment
      ? {
          numero: text(establishment.numeroEstablecimiento),
          direccion: text(establishment.direccionCompleta),
          nombreComercial: text(establishment.nombreFantasiaComercial),
          tipo: text(establishment.tipoEstablecimiento),
          esMatriz: yes(establishment.matriz),
        }
      : null,
    advertencias: warnings,
  };
}

function providerUrl(base: string, ruc: string) {
  if (base.includes("{ruc}")) {
    const configured = new URL(base.replaceAll("{ruc}", encodeURIComponent(ruc)));
    if (configured.protocol !== "https:") throw Error("La URL del proveedor debe usar HTTPS");
    return configured.href;
  }
  const configured = new URL(base);
  if (configured.protocol !== "https:") throw Error("La URL del proveedor debe usar HTTPS");
  const parameter = Deno.env.get("RUC_LOOKUP_API_RUC_PARAM") ?? "ruc";
  if (!PARAM_NAME.test(parameter)) throw Error("Parámetro RUC inválido");
  configured.searchParams.set(parameter, ruc);
  return configured.href;
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
    new Response(JSON.stringify(data), { headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }, status });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const provider = Deno.env.get("RUC_LOOKUP_API_URL");
  const admin = supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  // Denegar por defecto: origen, método, sesión y rol ADMIN en un solo punto.
  const ctx = await guardar(req, "/consultar-ruc", cors, admin);
  if (ctx instanceof Response) return ctx;
  if (!origin) return json({ error: "Servicio no configurado" }, 503);
  if (!provider) return json({ error: "Consulta fiscal no configurada" }, 503);

  const body = await req.json().catch(() => null) as { ruc?: unknown } | null;
  const ruc = typeof body?.ruc === "string" ? body.ruc.trim() : "";
  if (!RUC.test(ruc)) return json({ error: "Ingresa un RUC de 13 dígitos" }, 400);

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = Deno.env.get("RUC_LOOKUP_API_TOKEN");
  if (token) {
    const header = Deno.env.get("RUC_LOOKUP_API_TOKEN_HEADER") ?? "Authorization";
    const prefix = Deno.env.get("RUC_LOOKUP_API_TOKEN_PREFIX") ?? "Bearer";
    if (!HEADER_NAME.test(header)) return json({ error: "Configuración de proveedor inválida" }, 503);
    headers[header] = prefix ? `${prefix} ${token}` : token;
  }

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 8_000);
  try {
    const response = await fetch(providerUrl(provider, ruc), { headers, signal: abort.signal });
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) return json({ error: "Respuesta del proveedor demasiado grande" }, 502);
    if (!response.ok) {
      if (response.status === 404) return json({ error: "RUC no encontrado" }, 404);
      if (response.status === 429) return json({ error: "Límite de consultas alcanzado; intenta más tarde" }, 429);
      return json({ error: "El proveedor fiscal no está disponible" }, 502);
    }
    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) return json({ error: "Respuesta del proveedor demasiado grande" }, 502);
    const result = normalize(JSON.parse(raw), ruc);
    return json(result);
  } catch (error) {
    console.error("RUC lookup failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "No se pudo consultar el RUC en este momento" }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
