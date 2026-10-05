// Pruebas del guard de seguridad de las Edge Functions (deny-by-default).
// Se ejecutan en Node: el guard sólo necesita Deno.env, que se sustituye aquí.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUTAS, guardar, type Verificador } from "../supabase/functions/_shared/guard.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEN = "https://multifactu.vercel.app";

const ENTORNO: Record<string, string | undefined> = {
  APP_ORIGIN: ORIGEN,
  SRI_WEBHOOK_SECRET: "s".repeat(64),
  CRON_SECRET: "c".repeat(48),
};
(globalThis as Record<string, unknown>).Deno = {
  env: { get: (clave: string) => ENTORNO[clave] },
};

const peticion = (
  ruta: string,
  opciones: { method?: string; headers?: Record<string, string> } = {},
) =>
  new Request("https://pieabvfgokuomzkfotkz.supabase.co/functions/v1" + ruta, {
    method: opciones.method ?? "POST",
    headers: opciones.headers,
  });

// Mock del verificador: el token "valido" passa la firma (PostgREST) y su
// perfil es el pedido; cualquier otro token no passa (401 Sesión inválida).
const conSesion = (
  perfil: { tenant_id: string; rol: string } | null,
): Verificador =>
  async (token) =>
    token === "valido"
      ? {
          tokenValido: true,
          perfil: perfil ? { id: "user_test", ...perfil } : null,
        }
      : { tokenValido: false };

const verificadorQueFalla: Verificador = async () => {
  throw new Error("no debería autenticar aquí");
};

const cuerpo = async (respuesta: Response) =>
  (await respuesta.json()) as { error?: string };

test("el registro de rutas coincide exactamente con las carpetas de functions", () => {
  const carpetas = readdirSync(join(raiz, "supabase/functions"), {
    withFileTypes: true,
  })
    .filter((entrada) => entrada.isDirectory() && !/^[_.]/.test(entrada.name))
    .map((entrada) => "/" + entrada.name)
    .sort();
  assert.deepEqual(
    Object.keys(RUTAS).sort(),
    carpetas,
    "toda función nueva DEBE registrarse en RUTAS (y la retirada, borrarse)",
  );
});

test("cada función llama a guardar() con su propia ruta", () => {
  for (const ruta of Object.keys(RUTAS)) {
    const archivo = join(raiz, "supabase/functions", ruta.slice(1), "index.ts");
    const codigo = readFileSync(archivo, "utf8");
    assert.ok(
      codigo.includes(`guardar(req, "${ruta}"`),
      `${ruta} no invoca guardar(req, "${ruta}")`,
    );
  }
});

test("una ruta fuera del registro se deniega sin tocar secretos ni la BD", async () => {
  const respuesta = await guardar(
    peticion("/inexistente"),
    "/inexistente",
    {},
    verificadorQueFalla,
  );
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 403);
  assert.equal((await cuerpo(respuesta)).error, "Ruta no autorizada");
});

test("el método distinto de POST se rechaza con 405", async () => {
  const respuesta = await guardar(peticion("/generar-ride", { method: "GET" }), "/generar-ride", {});
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 405);
});

test("el preflight OPTIONS responde 204 con las cabeceras CORS", async () => {
  const cors = { "Access-Control-Allow-Origin": ORIGEN };
  const respuesta = await guardar(peticion("/generar-ride", { method: "OPTIONS" }), "/generar-ride", cors);
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 204);
  assert.equal(respuesta.headers.get("Access-Control-Allow-Origin"), ORIGEN);
});

test("un origen distinto de APP_ORIGIN se deniega con 403", async () => {
  const respuesta = await guardar(
    peticion("/generar-ride", { headers: { origin: "https://atacante.ej" } }),
    "/generar-ride",
    {},
    conSesion({ tenant_id: "t", rol: "ADMIN" }),
  );
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 403);
  assert.equal((await cuerpo(respuesta)).error, "Origen no permitido");
});

test("el nivel webhook exige el secreto compartido", async () => {
  const sinSecreto = { ...ENTORNO };
  delete ENTORNO.SRI_WEBHOOK_SECRET;
  const respuesta503 = await guardar(peticion("/sri-procesar"), "/sri-procesar");
  assert.ok(respuesta503 instanceof Response);
  assert.equal(respuesta503.status, 503);
  ENTORNO.SRI_WEBHOOK_SECRET = sinSecreto.SRI_WEBHOOK_SECRET;

  const incorrecto = await guardar(
    peticion("/notas-procesar", { headers: { "x-webhook-secret": "x".repeat(64) } }),
    "/notas-procesar",
  );
  assert.ok(incorrecto instanceof Response);
  assert.equal(incorrecto.status, 401);
  assert.equal((await cuerpo(incorrecto)).error, "No autorizado");

  const correcto = await guardar(
    peticion("/notas-procesar", { headers: { "x-webhook-secret": sinSecreto.SRI_WEBHOOK_SECRET! } }),
    "/notas-procesar",
  );
  assert.ok(!(correcto instanceof Response));
  assert.equal(correcto.rol, "sistema");
});

test("el nivel cron exige x-cron-secret", async () => {
  const sinSecreto = { ...ENTORNO };
  delete ENTORNO.CRON_SECRET;
  const respuesta = await guardar(peticion("/procesar-programadas"), "/procesar-programadas");
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 401);
  assert.equal((await cuerpo(respuesta)).error, "No autorizado");
  ENTORNO.CRON_SECRET = sinSecreto.CRON_SECRET;

  const correcto = await guardar(
    peticion("/procesar-programadas", { headers: { "x-cron-secret": sinSecreto.CRON_SECRET! } }),
    "/procesar-programadas",
  );
  assert.ok(!(correcto instanceof Response));
  assert.equal(correcto.rol, "sistema");
});

test("el nivel usuario exige sesión; sin cliente no hay servicio", async () => {
  const sinBearer = await guardar(peticion("/generar-ride"), "/generar-ride", {}, conSesion({ tenant_id: "t", rol: "ADMIN" }));
  assert.ok(sinBearer instanceof Response);
  assert.equal(sinBearer.status, 401);
  assert.equal((await cuerpo(sinBearer)).error, "Inicia sesión");

  const sinCliente = await guardar(
    peticion("/generar-ride", { headers: { authorization: "Bearer valido" } }),
    "/generar-ride",
  );
  assert.ok(sinCliente instanceof Response);
  assert.equal(sinCliente.status, 503);

  const sesionInvalida = await guardar(
    peticion("/generar-ride", { headers: { authorization: "Bearer caducado" } }),
    "/generar-ride",
    {},
    conSesion({ tenant_id: "t", rol: "ADMIN" }),
  );
  assert.ok(sesionInvalida instanceof Response);
  assert.equal(sesionInvalida.status, 401);
  assert.equal((await cuerpo(sesionInvalida)).error, "Sesión inválida");
});

test("un usuario con sesión y empresa recibe su tenant", async () => {
  const ctx = await guardar(
    peticion("/generar-ride", { headers: { authorization: "Bearer valido", origin: ORIGEN } }),
    "/generar-ride",
    {},
    conSesion({ tenant_id: "13149458-4fc3-4a3e-a966-8e31fa277d42", rol: "ADMIN" }),
  );
  assert.ok(!(ctx instanceof Response));
  assert.equal(ctx.tenant, "13149458-4fc3-4a3e-a966-8e31fa277d42");
  assert.equal(ctx.rol, "ADMIN");
});

test("sin empresa asignada no hay acceso", async () => {
  const respuesta = await guardar(
    peticion("/generar-ride", { headers: { authorization: "Bearer valido" } }),
    "/generar-ride",
    {},
    conSesion(null),
  );
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 403);
  assert.equal((await cuerpo(respuesta)).error, "Sin empresa asignada");
});

test("el nivel admin exige rol ADMIN", async () => {
  const respuesta = await guardar(
    peticion("/planes-pago", { headers: { authorization: "Bearer valido" } }),
    "/planes-pago",
    {},
    conSesion({ tenant_id: "t", rol: "EMPLEADO" }),
  );
  assert.ok(respuesta instanceof Response);
  assert.equal(respuesta.status, 403);
  assert.equal((await cuerpo(respuesta)).error, "Requiere administrador");

  const ok = await guardar(
    peticion("/verificar-p12", { headers: { authorization: "Bearer valido" } }),
    "/verificar-p12",
    {},
    conSesion({ tenant_id: "t", rol: "ADMIN" }),
  );
  assert.ok(!(ok instanceof Response));
  assert.equal(ok.rol, "ADMIN");
});

test("la ruta pública no pide credenciales pero sí origen correcto", async () => {
  const ctx = await guardar(peticion("/asistente-web"), "/asistente-web");
  assert.ok(!(ctx instanceof Response));
  assert.equal(ctx.rol, "publico");

  const malOrigen = await guardar(
    peticion("/asistente-web", { headers: { origin: "https://otro-sitio.ej" } }),
    "/asistente-web",
  );
  assert.ok(malOrigen instanceof Response);
  assert.equal(malOrigen.status, 403);
});
