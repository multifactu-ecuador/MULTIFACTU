// Control de acceso centralizado con DENEGAR POR DEFECTO.
//
// Una ruta sólo existe si está en RUTAS: cualquier función no registrada
// responde 403 ANTES de tocar cuerpo, BD o secretos. La lista RUTAS es la
// única fuente de verdad sobre quién puede llamar a qué y con qué nivel:
//   publico – sin sesión (asistente web); exige Origin == APP_ORIGIN.
//   usuario – JWT válido (Supabase Auth o Clerk) + empresa asignada.
//   admin   – idem usuario + rol ADMIN.
//   cron    – secreto compartido x-cron-secret (GitHub Actions).
//   webhook – secreto x-webhook-secret >= 32 caracteres (webhooks SRI).
//
// El guard NO importa ningún módulo: cada function inyecta su verificador
// (_shared/verificar.ts, que delega la firma del JWT en PostgREST porque
// auth.getUser() no resuelve tokens de Clerk). Así este archivo se puede
// importar y testear directamente en Node (tests/seguridad.test.ts).
//
// Nota dev: si APP_ORIGIN no coincide con el origen del navegador
// (p. ej. http://127.0.0.1:5173), el front recibirá 403. Define
// APP_ORIGIN localmente para probar functions con sesión.

export type Nivel = "publico" | "usuario" | "admin" | "cron" | "webhook";

export interface Ctx {
  tenant: string; // vacío en rutas que no son de empresa
  rol: string;
  uid: string;
}

/** Resultado de verificar un JWT: o la firma no passa, o passa y el
 *  filtro RLS decide si hay perfil (null = sin empresa asignada). */
export type Verificacion =
  | { tokenValido: false }
  | {
      tokenValido: true;
      perfil: { id: string; tenant_id: string; rol: string } | null;
    };

/** Verificador inyectado por cada function (ver _shared/verificar.ts). */
export type Verificador = (token: string) => Promise<Verificacion>;

// REGISTRO ÚNICO: al añadir una function DEBE añadirse aquí, o el test
// tests/seguridad.test.ts y esta función la bloquearán con 403.
export const RUTAS: Record<string, Nivel> = {
  "/asistente": "admin",
  "/asistente-web": "publico",
  "/consultar-ruc": "admin",
  "/generar-ride": "usuario",
  "/notas-procesar": "webhook",
  "/pagos-webhook": "publico",
  "/paddle-portal": "usuario",
  "/paddle-webhook": "publico",
  "/planes-pago": "admin",
  "/procesar-programadas": "cron",
  "/sri-procesar": "webhook",
  "/verificar-p12": "admin",
};

/** Comparación en tiempo constante (sin importar el largo real: SHA-256
 *  de ambos valores y XOR byte a byte; evita timing attacks). */
async function secretoIgual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  let mismatch = 0;
  const l = new Uint8Array(left),
    r = new Uint8Array(right);
  for (let i = 0; i < 32; i++) mismatch |= l[i] ^ r[i];
  return mismatch === 0;
}

export async function guardar(
  req: Request,
  ruta: string,
  cors: Record<string, string> = {},
  verificar?: Verificador | null,
): Promise<Ctx | Response> {
  const json = (data: unknown, status: number) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...cors,
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });

  // 1) DENEGAR POR DEFECTO: fuera del registro, fuera del sistema.
  const nivel = RUTAS[ruta];
  if (!nivel) return json({ error: "Ruta no autorizada" }, 403);

  // 2) Origen estricto: si el navegador envía Origin, debe estar en la
  //    lista de APP_ORIGIN (varios separados por coma durante la
  //    transición de dominio). Sin cabecera Origin (servidor → servidor)
  //    no aplica. El guard no importa módulos (se testea en Node), así
  //    que la lista se parsea aquí.
  const permitidos = (Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((o: string) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const dado = req.headers.get("origin")?.replace(/\/$/, "");
  if (dado && !permitidos.includes(dado))
    return json({ error: "Origen no permitido" }, 403);

  // 3) Preflight CORS y método único.
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // 4) Ruta pública: no pide credenciales (su rate-limit vive en la función).
  if (nivel === "publico") return { tenant: "", rol: "publico", uid: "" };

  // 5) Servidores de confianza (cron/webhook): secreto compartido.
  if (nivel === "cron" || nivel === "webhook") {
    const varNombre = nivel === "cron" ? "CRON_SECRET" : "SRI_WEBHOOK_SECRET";
    const cabecera = nivel === "cron" ? "x-cron-secret" : "x-webhook-secret";
    const esperado = Deno.env.get(varNombre);
    if (!esperado || (nivel === "webhook" && esperado.length < 32))
      return json(
        {
          error:
            nivel === "webhook" ? "Webhook no configurado" : "No autorizado",
        },
        nivel === "webhook" ? 503 : 401,
      );
    if (!(await secretoIgual(req.headers.get(cabecera) ?? "", esperado)))
      return json({ error: "No autorizado" }, 401);
    return { tenant: "", rol: "sistema", uid: "" };
  }

  // 6) usuario/admin: JWT verificado (PostgREST valida la firma, sea de
  //    Supabase Auth o de Clerk) + perfil con RLS; admin exige rol ADMIN.
  const bearer = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!bearer) return json({ error: "Inicia sesión" }, 401);
  if (!verificar) return json({ error: "Servicio no configurado" }, 503);
  let visto: Verificacion;
  try {
    visto = await verificar(bearer);
  } catch {
    return json({ error: "Sesión inválida" }, 401);
  }
  if (!visto.tokenValido) return json({ error: "Sesión inválida" }, 401);
  const perfil = visto.perfil;
  if (!perfil) return json({ error: "Sin empresa asignada" }, 403);
  if (nivel === "admin" && perfil.rol !== "ADMIN")
    return json({ error: "Requiere administrador" }, 403);
  return { tenant: perfil.tenant_id, rol: perfil.rol, uid: perfil.id };
}
