// Asistente público de la web (MULTI): responde dudas de visitantes sobre
// MULTIFACTU usando la IA entrenada con el conocimiento del sistema.
// Sin login ni datos de empresas: sólo información pública del producto.
// Límite anti-abuso: 15 preguntas/hora por IP (tabla asistente_web_intentos).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { CONOCIMIENTO_SISTEMA, preguntarNvidia } from "../_shared/system-knowledge.ts";
import { guardar } from "../_shared/guard.ts";
import { acaoDe, listaOrigenes } from "../_shared/origen.ts";

const MAX_POR_HORA = 15;

Deno.serve(async (req) => {
  const origenes = listaOrigenes();
  const cors = {
    "Access-Control-Allow-Origin": acaoDe(req),
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  // Origen/método/ruta pública resueltos en el guard (deny-by-default).
  const acceso = await guardar(req, "/asistente-web", cors);
  if (acceso instanceof Response) return acceso;

  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret || !origenes.length) return json({ error: "Servicio no configurado" }, 503);
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let pregunta = "";
  try {
    const body = await req.json();
    pregunta = typeof body?.pregunta === "string" ? body.pregunta.trim().slice(0, 400) : "";
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!pregunta) return json({ error: "Escribe tu pregunta" }, 400);

  // IP de confianza: cabecera del proxy si existe; en x-forwarded-for se toma
  // el ÚLTIMO salto (cada proxy lo añade al final, así que el cliente no
  // puede falsearlo desde fuera) y se valida el formato.
  const ipCruda =
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "";
  const ip = /^[0-9a-f:.]{3,45}$/i.test(ipCruda) ? ipCruda : "desconocida";
  const desde = new Date(Date.now() - 3600000).toISOString();
  // Se registra ANTES de contar (cierra la carrera lectura→escritura) y se
  // purgan los intentos con más de 72 h: no retenemos IPs de visitantes.
  await admin
    .from("asistente_web_intentos")
    .delete()
    .lt("creado_en", new Date(Date.now() - 72 * 3600000).toISOString());
  await admin.from("asistente_web_intentos").insert({ ip });
  const { count, error: countError } = await admin
    .from("asistente_web_intentos")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("creado_en", desde);
  if (countError) return json({ error: "No se pudo procesar" }, 500);
  if ((count ?? 0) > MAX_POR_HORA)
    return json(
      { error: "Has hecho muchas preguntas seguidas. Inténtalo en una hora o crea tu cuenta gratis para probarlo todo." },
      429,
    );

  const respuesta = await preguntarNvidia(
    [
      { role: "system", content: CONOCIMIENTO_SISTEMA },
      { role: "user", content: pregunta },
    ],
    { maxTokens: 350 },
  );
  if (!respuesta)
    return json({
      respuesta:
        "Ahora mismo no puedo responder, pero puedes crear tu cuenta gratis y probar todas las funciones durante 7 días. ¿Qué te gustaría saber de MULTIFACTU?",
    });
  return json({ respuesta });
});
