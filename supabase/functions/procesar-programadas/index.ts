import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || !(await equalSecret(req.headers.get("x-cron-secret") ?? "", expected)))
    return json({ error: "No autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Backend no configurado" }, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("procesar_facturas_programadas");
  if (error) return json({ error: error.message }, 500);
  return json({ procesadas: data });
});
async function equalSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  let mismatch = 0;
  const l = new Uint8Array(left), r = new Uint8Array(right);
  for (let i = 0; i < 32; i++) mismatch |= l[i] ^ r[i];
  return mismatch === 0;
}