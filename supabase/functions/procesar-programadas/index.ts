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
  if (error) {
    // El mensaje de Postgres no sale ni al cron: sólo queda en el log.
    console.error("procesar-programadas:", error.message);
    return json({ error: "No se pudieron procesar las facturas programadas" }, 500);
  }
  // Purga de contadores/retención de IP (minimización de datos, LOPDP):
  // las tablas de rate limit sólo necesitan la ventana de 1 hora activa.
  const corte = new Date(Date.now() - 72 * 3600000).toISOString();
  await Promise.all([
    db.from("asistente_web_intentos").delete().lt("creado_en", corte),
    db.from("p12_verify_intentos").delete().lt("creado_en", corte),
    db.from("emision_intentos").delete().lt("creado_en", corte),
    db.from("edge_rate_limits").delete().lt("creado_en", corte),
  ]);
  return json({ procesadas: data });
});
