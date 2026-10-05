import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!url && !!key && !url.includes("TU-PROYECTO");

/**
 * Puente de token Clerk → Supabase.
 *
 * La sesión la gestiona Clerk (integración nativa con Supabase); el frontend
 * no usa Supabase Auth. AuthContext registra aquí un getter que devuelve el
 * JWT de Clerk (plantilla `supabase`) y supabase-js lo adjunta a cada
 * petición como `Authorization: Bearer …`, de modo que RPC/RLS/Storage
 * siguen recibiendo un `sub` (= id de Clerk, texto `user_…`).
 *
 * Firma comprobada en los tipos de @supabase/supabase-js 2.117.2:
 *   accessToken?: () => Promise<string | null>
 */
export type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;
export function setSupabaseTokenGetter(getter: TokenGetter | null) {
  tokenGetter = getter;
}
/** Token actual de la sesión de Clerk, o null si no hay sesión. */
export const getSupabaseToken: TokenGetter = async () => {
  if (!tokenGetter) return null;
  try {
    return await tokenGetter();
  } catch {
    return null;
  }
};

// Únicamente clave pública. SERVICE_ROLE nunca se incluye en VITE_*.
export const supabase = configured
  ? createClient<Database>(url, key, { accessToken: getSupabaseToken })
  : null;
export function db() {
  if (!supabase)
    throw Error(
      "Configura client/.env con la URL y clave pública de Supabase.",
    );
  return supabase;
}
export function check<R extends { error: { message: string } | null }>(
  r: R,
): R extends { data: infer T } ? T : undefined {
  if (r.error) throw Error(r.error.message);
  return (r as R & { data?: unknown }).data as R extends { data: infer T }
    ? T
    : undefined;
}
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const money = (value: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(
    value,
  );

/**
 * true cuando la empresa completó todos sus documentos para emitir en modo
 * real: RUC válido, razón social, régimen, certificado .p12 y su contraseña
 * verificada (guardada cifrada en Vault).
 */
export const sriRealListo = (e?: {
  ruc?: string | null;
  razon_social?: string | null;
  regimen?: string | null;
  ruta_p12?: string | null;
  p12_secret_id?: string | null;
}) =>
  !!e &&
  !!e.ruc &&
  /^\d{13}$/.test(e.ruc) &&
  !!e.razon_social &&
  !!e.regimen &&
  !!e.ruta_p12 &&
  !!e.p12_secret_id;
