// Portal de cliente de Paddle (autoservicio alojado por Paddle): el
// usuario autenticado gestiona su propia suscripción — medio de pago,
// cancelación y facturas — en la URL que minte esta function.
//
// Modelo de seguridad (idéntico al del skill de portal):
//   1) La sesión se valida ANTES de todo (guard + verificarEntorno).
//   2) El customer_id se resuelve EN EL SERVIDOR por el email del usuario
//      autenticado contra el espejo paddle_clientes; el cliente jamás
//      envía ni elige un customer_id (un usuario no puede pedir el portal
//      de otra persona).
//   3) La respuesta sólo contiene la URL de overview: el objeto de sesión
//      completo filtraría ids y enlaces profundos que el front no necesita.
// Las URLs del portal son de un solo uso y caducan: se minte una fresca
// por clic, nunca se cachea.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";
import { verificarEntorno } from "../_shared/verificar.ts";
import { paddleApi } from "../_shared/paddle.ts";

/** Email del payload del JWT ya verificado por guardar() (PostgREST
 *  validó la firma del token de Clerk): sirve de respaldo cuando el
 *  perfil aún no tiene email guardado. */
function emailDelToken(req: Request): string {
  try {
    const token =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const cuerpo = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(cuerpo)) as { email?: unknown };
    return typeof claims.email === "string" ? claims.email : "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  const origin = Deno.env.get("APP_ORIGIN")?.replace(/\/$/, "");
  const cors = {
    "Access-Control-Allow-Origin": origin ?? "http://localhost:5173",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  const url = Deno.env.get("SUPABASE_URL"),
    secreto = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secreto || !origin)
    return json({ error: "Servicio no configurado" }, 503);
  // Denegar por defecto: origen, método y sesión de usuario en un solo punto.
  const ctx = await guardar(req, "/paddle-portal", cors, verificarEntorno);
  if (ctx instanceof Response) return ctx;
  const admin = createClient(url, secreto, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    // 1) El email sale del USUARIO AUTENTICADO (uid del JWT verificado):
    //    perfil primero y, como respaldo, los claims del propio token.
    const perfil = await admin
      .from("usuarios_perfiles")
      .select("email")
      .eq("id", ctx.uid)
      .maybeSingle();
    const email = perfil.data?.email || emailDelToken(req);
    if (!email)
      return json({ error: "Tu cuenta no tiene correo registrado" }, 409);
    // 2) Puente email → customer_id en el espejo (lo llena el webhook con
    //    customer.created/updated). Escapar % y _ para que ilike no los
    //    trate como comodines.
    const cliente = await admin
      .from("paddle_clientes")
      .select("customer_id")
      .ilike("email", email.replace(/[%_]/g, "\\$&"))
      .maybeSingle();
    if (cliente.error) throw Error(cliente.error.message);
    const customerId = cliente.data?.customer_id as string | undefined;
    if (!customerId)
      return json(
        { error: "Aún no tienes una suscripción con Paddle" },
        404,
      );
    // 3) Suscripciones del cliente: habilitan los enlaces profundos del
    //    portal (cancelar / actualizar medio de pago de cada una).
    const subs = await admin
      .from("paddle_suscripciones")
      .select("subscription_id")
      .eq("customer_id", customerId);
    if (subs.error) throw Error(subs.error.message);
    const ids = (subs.data ?? []).map((f) => f.subscription_id as string);
    // 4) Sesión fresca por clic con el cliente API (entorno y clave
    //    declarados; si faltan, paddleApi lanza y responde 503).
    let sesion;
    try {
      sesion = await paddleApi().customerPortalSessions.create(customerId, ids);
    } catch (e) {
      console.error("paddle-portal: configuración de Paddle:", e);
      return json({ error: "Paddle no está configurado" }, 503);
    }
    return json({ url: sesion.urls.general.overview });
  } catch (e) {
    console.error("paddle-portal:", e);
    return json({ error: "No se pudo abrir el portal de Paddle" }, 502);
  }
});
