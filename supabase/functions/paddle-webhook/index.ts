// Webhook de Paddle para el fulfillment de la venta internacional
// (planes Inicial/Pro/Luxury comprados desde /precios).
//
// La ruta es pública a nivel de guard (Paddle nos llama servidor a
// servidor, sin JWT nuestro), pero NINGÚN evento se procesa antes de
// superar la verificación de firma del propio SDK de Paddle
// (webhooks.unmarshal con el secreto de ESTA notificación; el secreto de
// firma es distinto de la API key). Los efectos son espejo idempotente:
//   - customer.created/updated → paddle_clientes (puente email→customer).
//   - subscription.created/updated/canceled → paddle_suscripciones (estado
//     que gobierna private.paddle_acceso).
//   - transaction.completed → paddle_transacciones (conciliación).
// Cualquier otro tipo se ignora con seguridad.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";
import { paddleSoloFirma } from "../_shared/paddle.ts";
import { procesarEvento } from "./procesar.ts";

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  // Denegar por defecto: sólo la ruta registrada; la autenticación real es
  // la firma HMAC, verificada más abajo contra el cuerpo crudo.
  const ctx = await guardar(req, "/paddle-webhook");
  if (ctx instanceof Response) return ctx;
  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json({ error: "Servicio no configurado" }, 503);
  // Cuerpo CRUDO: un JSON parseado y re-serializado no coincide byte a byte
  // con lo que Paddle firmó y la verificación fallaría siempre.
  const bruto = await req.text();
  const firma = req.headers.get("paddle-signature") ?? "";
  if (!bruto || !firma) return json({ error: "Falta cuerpo o firma" }, 400);
  if (bruto.length > 200_000)
    return json({ error: "Cuerpo demasiado grande" }, 413);
  // El secreto es el de ESTA notificación (Events > Notifications), no la
  // API key. Sin él configurado no se verifica nada: no-2xx y Paddle
  // reintenta hasta que la function esté desplegada con el secreto.
  const secretoWebhook = Deno.env.get("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
  if (!secretoWebhook)
    return json({ error: "Webhook no configurado" }, 503);
  try {
    // 1) Verificación ANTES de cualquier efecto. Un sólo catch con UN
    //    no-2xx (500) para todo: firma inválida, secreto rotado y payload
    //    corrupto son indistinguibles, y cualquier no-2xx hace que Paddle
    //    reintente (un 2xx aquí marcaría el evento como entregado y lo
    //    perderíamos para siempre).
    const evento = await paddleSoloFirma().webhooks.unmarshal(
      bruto,
      secretoWebhook,
      firma,
    );
    // 2) Espejo idempotente (upsert por id de Paddle) con la service role.
    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await procesarEvento(evento, admin);
    return json({ received: true });
  } catch (e) {
    console.error("paddle-webhook:", e);
    return json({ error: "No procesado" }, 500);
  }
});
