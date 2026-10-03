import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = !!url && !!key && !url.includes("TU-PROYECTO");
// Únicamente clave pública. SERVICE_ROLE nunca se incluye en VITE_*.
export const supabase = configured ? createClient<Database>(url, key) : null;
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
