// Verificación de identidad para el guard (deny-by-default).
//
// La firma del JWT se delega en PostgREST: él valida el token (claves de
// Supabase Auth o de la integración nativa de Clerk, que expone su JWKS)
// y aplica RLS. La política perfil_read sólo devuelve filas del tenant del
// usuario, y el filtro id = sub acota a la fila propia: un token firmado
// pero sin empresa devuelve null, y uno con firma inválida da error.
//
// Por qué no auth.getUser(): con tokens de Clerk (sub = user_…) GoTrue
// responde 403 "signing method RS256 is invalid" porque ese endpoint sólo
// resuelve usuarios de auth.users. Verificado en 2026-10 contra prod.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import type { Verificacion } from "./guard.ts";

/** Lee el sub del payload sin verificar (la firma ya la valida PostgREST
 *  al ejecutar la consulta; el sub sólo se usa como filtro). */
function subDel(token: string): string | null {
  try {
    const cuerpo = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(cuerpo)) as { sub?: unknown };
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Verificador usable por cualquier function: lee SUPABASE_URL y la clave
 *  pública del entorno de Functions en cada llamada. */
export const verificarEntorno = async (token: string): Promise<Verificacion> => {
  const sub = subDel(token);
  if (!sub) return { tokenValido: false };
  const url = Deno.env.get("SUPABASE_URL");
  const clave =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !clave) return { tokenValido: false };
  const cliente = createClient(url, clave, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await cliente
    .from("usuarios_perfiles")
    .select("id,tenant_id,rol")
    .eq("id", sub)
    .maybeSingle();
  // Firma inválida/caducada o RLS sin derecho: no hay sesión de confianza.
  if (error) return { tokenValido: false };
  return { tokenValido: true, perfil: data };
};
