// Allowlist de IPs de Paddle (paddle-ips.ts): parsing de IPv4/CIDR,
// denegar por defecto y comportamiento de la caché de la lista. Módulo sin
// dependencias, se ejecuta en Node con node --test (mismo runner que
// tests/paddle.test.ts).
import test from "node:test";
import assert from "node:assert/strict";
import {
  ipv4AEntero,
  ipPermitida,
  normalizarIp,
  ipsPaddle,
  reiniciarCacheIps,
} from "../supabase/functions/_shared/paddle-ips.ts";

/** Forma exacta de la respuesta de https://api.paddle.com/ips (verificada
 *  en vivo el 2026-10-10): data.ipv4_cidrs con /32. */
const LISTA_REAL = [
  "34.237.3.244/32",
  "34.195.105.136/32",
  "34.232.58.13/32",
  "35.155.119.135/32",
  "34.212.5.7/32",
  "52.11.166.252/32",
];

test("ipPermitida acepta exactamente las /32 publicadas por Paddle", () => {
  for (const cidr of LISTA_REAL) {
    assert.equal(ipPermitida(cidr.replace(/\/32$/, ""), LISTA_REAL), true);
  }
});

test("ipPermitida deniega cualquier IP fuera de la lista", () => {
  for (const ip of ["8.8.8.8", "34.237.3.245", "127.0.0.1", "10.0.0.1"]) {
    assert.equal(ipPermitida(ip, LISTA_REAL), false);
  }
});

test("normalizarIp quita el prefijo v4-mapeada que puede traer el runtime", () => {
  assert.equal(normalizarIp(" ::ffff:34.237.3.244 "), "34.237.3.244");
  assert.equal(ipPermitida("::ffff:34.237.3.244", LISTA_REAL), true);
});

test("denegar por defecto: IPv6 real, basura, vacío y números fuera de rango", () => {
  assert.equal(ipPermitida("2606:4700::1111", LISTA_REAL), false);
  assert.equal(ipPermitida("no-es-ip", LISTA_REAL), false);
  assert.equal(ipPermitida("", LISTA_REAL), false);
  assert.equal(ipPermitida("256.1.1.1", LISTA_REAL), false);
  assert.equal(ipPermitida("1.2.3", LISTA_REAL), false);
});

test("soporta prefijos de red cortos además de /32", () => {
  assert.equal(ipPermitida("10.4.5.6", ["10.4.0.0/16"]), true);
  assert.equal(ipPermitida("10.5.0.1", ["10.4.0.0/16"]), false);
  assert.equal(ipPermitida("0.0.0.0", ["0.0.0.0/0"]), true);
  assert.equal(ipPermitida("1.2.3.4", ["cidr-inútil"]), false);
});

test("ipv4AEntero convierte y rechaza con precisión", () => {
  assert.equal(ipv4AEntero("0.0.0.0"), 0);
  assert.equal(ipv4AEntero("255.255.255.255"), 4294967295);
  assert.equal(ipv4AEntero("34.237.3.244"), 585958388);
  assert.equal(ipv4AEntero("::1"), null);
  assert.equal(ipv4AEntero(""), null);
});

// ── Caché de la lista (fetch simulado) ────────────────────────────────────
test("ipsPaddle parsea data.ipv4_cidrs y cachea dentro del TTL", async () => {
  reiniciarCacheIps();
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (async () => {
    llamadas++;
    return new Response(JSON.stringify({ data: { ipv4_cidrs: LISTA_REAL } }));
  }) as typeof fetch;
  try {
    const primera = await ipsPaddle();
    const segunda = await ipsPaddle();
    assert.deepEqual(primera, LISTA_REAL);
    assert.equal(llamadas, 1); // la segunda lectura sale de caché
  } finally {
    globalThis.fetch = original;
    reiniciarCacheIps();
  }
});

test("ipsPaddle devuelve null si NUNCA pudo cargar (el webhook hará no-2xx)", async () => {
  reiniciarCacheIps();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("red caída");
  }) as typeof fetch;
  try {
    assert.equal(await ipsPaddle(), null);
  } finally {
    globalThis.fetch = original;
    reiniciarCacheIps();
  }
});

test("ipsPaddle sirve la caché vencida si la revalidación falla", async () => {
  reiniciarCacheIps();
  const originalFetch = globalThis.fetch;
  const originalAhora = Date.now;
  try {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: { ipv4_cidrs: LISTA_REAL } }),
      )) as typeof fetch;
    assert.deepEqual(await ipsPaddle(), LISTA_REAL);
    // Avanza el reloj más allá del TTL y cae la red: se sirve la vencida.
    Date.now = () => originalAhora() + 2 * 60 * 60 * 1000;
    globalThis.fetch = (async () => {
      throw new Error("red caída");
    }) as typeof fetch;
    assert.deepEqual(await ipsPaddle(), LISTA_REAL);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalAhora;
    reiniciarCacheIps();
  }
});

test("ipsPaddle rechaza respuestas sin ipv4_cidrs (lista vacía = error)", async () => {
  reiniciarCacheIps();
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { ipv4_cidrs: [] } }))) as typeof fetch;
  try {
    assert.equal(await ipsPaddle(), null);
  } finally {
    globalThis.fetch = original;
    reiniciarCacheIps();
  }
});
