// Verifica que una contraseña candidata abra el .p12 de la empresa y que el
// certificado esté vigente y corresponda al RUC registrado. Autenticación por
// JWT (auth.getUser) + rol ADMIN. La contraseña viaja sólo por TLS, se usa en
// RAM y jamás se almacena ni se registra. Límite anti fuerza-bruta por empresa.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { verificarCertificadoP12 } from "../_shared/p12-check.ts";
import { guardar } from "../_shared/guard.ts";
import { verificarEntorno } from "../_shared/verificar.ts";

const MAX_INTENTOS = 10;
const VENTANA_MINUTOS = 15;

const MENSAJES: Record<string, string> = {
  INVALID_PASSWORD: "La contraseña no coincide con el certificado.",
  INVALID_FILE: "El archivo .p12 está dañado o no es un certificado válido.",
  NO_SIGNING_KEY: "El .p12 se abrió, pero no contiene una clave privada de firma.",
  EXPIRED: "La contraseña es correcta, pero el certificado está CADUCADO.",
  NOT_YET_VALID: "La contraseña es correcta, pero el certificado aún no entra en vigencia.",
  RUC_MISMATCH: "La contraseña es correcta, pero el certificado NO muestra el RUC de tu empresa.",
};

Deno.serve(async (req) => {
  const origin = Deno.env.get("APP_ORIGIN")?.replace(/\/$/, "");
  const cors = {
    "Access-Control-Allow-Origin": origin ?? "http://localhost:5173",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret || !origin) return json({ error: "Servicio no configurado" }, 503);
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Denegar por defecto: origen, método, sesión y rol ADMIN en un solo punto.
  const ctx = await guardar(req, "/verificar-p12", cors, verificarEntorno);
  if (ctx instanceof Response) return ctx;
  const tenant = ctx.tenant;

  let password: string;
  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!password || password.length > 128)
    return json({ error: "Escribe la contraseña del certificado" }, 400);

  // Límite anti fuerza-bruta por empresa: RPC atómica que registra el
  // intento y cuenta la ventana en una sola consulta. La versión previa
  // (count → insert) tenía una carrera TOCTOU: peticiones concurrentes
  // leían el mismo recuento y todas pasaban el tope.
  const limite = await admin.rpc("registrar_intento_edge", {
    p_clave: `p12-verify:${tenant}`,
    p_limite: MAX_INTENTOS,
    p_ventana_min: VENTANA_MINUTOS,
  });
  if (limite.error) return json({ error: "No se pudo verificar" }, 500);
  if (limite.data !== true)
    return json(
      { error: `Demasiados intentos. Espera ${VENTANA_MINUTOS} minutos.` },
      429,
    );

  const { data: empresa, error: empresaError } = await admin
    .from("empresas")
    .select("ruta_p12,ruc")
    .eq("id", tenant)
    .single();
  if (empresaError || !empresa?.ruta_p12)
    return json({
      passwordOk: false,
      code: "NO_P12",
      mensaje: "Primero sube tu certificado .p12 en «Logo y certificado».",
    });

  const { data: file, error: downloadError } = await admin.storage
    .from("certificados")
    .download(empresa.ruta_p12);
  if (downloadError || !file)
    return json({
      passwordOk: false,
      code: "NO_P12",
      mensaje: "No se encontró el archivo del certificado; vuelve a subirlo.",
    });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const resultado = verificarCertificadoP12(bytes, password, empresa.ruc ?? "");
  bytes.fill(0);

  return json({
    ...resultado,
    mensaje:
      resultado.code === "VALID"
        ? "Contraseña verificada: coincide con el certificado."
        : MENSAJES[resultado.code] ?? "No se pudo verificar el certificado.",
  });
});
