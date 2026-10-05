import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  // Denegar por defecto: sólo el cron con el secreto compartido (x-cron-secret).
  const ctx = await guardar(req, "/procesar-programadas");
  if (ctx instanceof Response) return ctx;
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Backend no configurado" }, 503);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("procesar_facturas_programadas");
  if (error) return json({ error: error.message }, 500);
  return json({ procesadas: data });
});
