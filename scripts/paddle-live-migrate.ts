// Migra el catálogo de planes de MULTIFACTU de la cuenta SANDBOX a la
// cuenta LIVE de Paddle (los MCP paddle-sandbox/paddle-live no están
// conectados en esta sesión: se usa la API REST/SDK, que es lo mismo).
//
// Migración ADITIVA y re-ejecutable. Reglas sagradas:
//   - Sandbox es la fuente de verdad: este script SÓLO LEE de sandbox.
//   - En live sólo se CREA lo que falte; un producto/precio existente con
//     el mismo nombre/descripción se REUTILIZA (nunca se borra ni
//     recrea; "fix if wrong" = actualizar en el panel, o preguntar).
//   - Si sandbox tiene descuentos, el script se DETIENE y los lista:
//     decidimos juntos cómo recrearlos (nada se toca).
//
// Uso (PowerShell, en la raíz del repo):
//   $env:PADDLE_API_KEY="pdl_sdbx_..."       # sandbox, sólo lectura
//   $env:PADDLE_LIVE_API_KEY="pdl_live_..."  # live, creación (vendors.paddle.com)
//   npx tsx scripts/paddle-live-migrate.ts
//
// Salidas:
//   - scripts/paddle-live-mapping.json → mapa old→new + token de cliente
//     live (el token es público: va a VITE_PADDLE_CLIENT_TOKEN).
//   - .paddle-live-secret.txt → secreto de FIRMA del destino de
//     notificación live (sólo lo ve la máquina: supabase secrets set ...
//     y borrar el archivo; NUNCA se pega en el chat).
import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

// ── Cuentas: sandbox (lectura) y live (creación) ──────────────────────────
const claveSandbox = process.env.PADDLE_API_KEY;
if (!claveSandbox?.startsWith("pdl_sdbx_")) {
  console.error(
    "Falta PADDLE_API_KEY sandbox (pdl_sdbx_...) o no parece de sandbox.",
  );
  process.exit(1);
}
const claveLive = process.env.PADDLE_LIVE_API_KEY;
if (!claveLive?.startsWith("pdl_live_")) {
  console.error(
    "Falta PADDLE_LIVE_API_KEY live (pdl_live_...): créala en vendors.paddle.com > Settings > API keys.",
  );
  process.exit(1);
}

const sandbox = new Paddle(claveSandbox, { environment: Environment.sandbox });
const live = new Paddle(claveLive, { environment: Environment.production });

/** Únicos productos del plan: el resto de sandbox se salta (junk/test). */
const NOMBRES_OBJETIVO = [
  "MULTIFACTU Inicial",
  "MULTIFACTU Pro",
  "MULTIFACTU Luxury",
];

const URL_WEBHOOK =
  "https://pieabvfgokuomzkfotkz.supabase.co/functions/v1/paddle-webhook";
const EVENTOS = [
  "customer.created",
  "customer.updated",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "transaction.completed",
];

const ARCHIVO_MAPA = new URL("./paddle-live-mapping.json", import.meta.url);
const ARCHIVO_SECRETO = new URL("../.paddle-live-secret.txt", import.meta.url);

// ── REST crudo para endpoints que el SDK no envuelve ──────────────────────
async function rest(
  clave: string,
  metodo: string,
  ruta: string,
  cuerpo?: object,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`https://api.paddle.com${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${clave}`,
      "Content-Type": "application/json",
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const texto = await r.text();
  const json = (texto ? JSON.parse(texto) : {}) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(`${metodo} ${ruta} → HTTP ${r.status}: ${texto.slice(0, 300)}`);
  }
  return { status: r.status, json };
}

interface Mapa {
  creado_en: string;
  productos: Array<{ sandbox: string; live: string; nombre: string }>;
  precios: Array<{
    sandbox: string;
    live: string;
    plan: string;
    ciclo: string;
    descripcion: string;
  }>;
  client_token_live?: string;
  destino_notificacion?: { id: string; destination: string };
}

async function migrar() {
  // ── 0) Mapa previo (re-ejecución segura) ────────────────────────────────
  const mapa: Mapa = existsSync(ARCHIVO_MAPA)
    ? JSON.parse(readFileSync(ARCHIVO_MAPA, "utf8"))
    : {
        creado_en: new Date().toISOString(),
        productos: [],
        precios: [],
      };
  const productoYaMapeado = (idSandbox: string) =>
    mapa.productos.find((p) => p.sandbox === idSandbox);
  const precioYaMapeado = (idSandbox: string) =>
    mapa.precios.find((p) => p.sandbox === idSandbox);

  // ── 1) Leer sandbox: descuentos primero (si hay, no avanzamos) ──────────
  const descuentos = await sandbox.discounts.list({ perPage: 100 });
  if (descuentos.data.length > 0) {
    console.error(
      "⚠ sandbox tiene descuentos; no los recreo sin decidirlo juntos:",
    );
    console.error(JSON.stringify(descuentos.data, null, 2));
    console.error("Dime cómo proceder (nada se tocó en live).");
    process.exit(2);
  }
  console.log("· Descuentos en sandbox: ninguno (nada que migrar).");

  // ── 2) Productos: sólo los del plan; en live se reutiliza por nombre ───
  const productosSandbox = await sandbox.products.list({ perPage: 100 });
  const productosLive = await live.products.list({ perPage: 100 });
  for (const fuera of productosSandbox.data.filter(
    (p) => !NOMBRES_OBJETIVO.includes(p.name),
  )) {
    console.log(`· Saltado (no es del plan): "${fuera.name}" (${fuera.id}).`);
  }

  const mapaProductos: Array<{ idSandbox: string; idLive: string; nombre: string }> = [];
  for (const plan of NOMBRES_OBJETIVO) {
    const origen = productosSandbox.data.find((p) => p.name === plan);
    if (!origen) {
      console.error(`⚠ No encontré "${plan}" en sandbox: revisa el catálogo origen.`);
      process.exit(3);
    }
    const previo = productoYaMapeado(origen.id);
    const existente = productosLive.data.find((p) => p.name === plan);
    let idLive: string;
    if (existente) {
      idLive = existente.id;
      console.log(`· "${plan}" ya existe en live (${idLive}) — se REUTILIZA.`);
    } else {
      const creado = await live.products.create({
        name: plan,
        taxCategory: "saas",
        description: origen.description ?? "",
      });
      idLive = creado.id;
      console.log(`+ "${plan}" creado en live (${idLive}).`);
    }
    if (!previo) {
      mapa.productos.push({ sandbox: origen.id, live: idLive, nombre: plan });
    }
    mapaProductos.push({ idSandbox: origen.id, idLive, nombre: plan });
  }

  // ── 3) Precios: copiar atributos tal cual (importe, moneda, overrides,
  //        ciclo y prueba de 7 días); en live se reutiliza por descripción.
  for (const { idSandbox, idLive, nombre } of mapaProductos) {
    const preciosSandbox = await sandbox.prices.list({
      productId: idSandbox,
      perPage: 100,
    });
    const preciosLive = await live.prices.list({ productId: idLive, perPage: 100 });
    for (const p of preciosSandbox.data) {
      if (p.status !== "active") {
        console.log(`  · Saltado (no activo): ${p.description} (${p.id}).`);
        continue;
      }
      if (!p.billingCycle) {
        console.log(
          `  · Saltado (sin ciclo de suscripción): ${p.description} (${p.id}).`,
        );
        continue;
      }
      const previo = precioYaMapeado(p.id);
      const existente = preciosLive.data.find((q) => q.description === p.description);
      let idLivePrecio: string;
      if (existente) {
        idLivePrecio = existente.id;
        console.log(`  · "${p.description}" ya existe en live (${idLivePrecio}) — se REUTILIZA.`);
      } else {
        const creado = await live.prices.create({
          productId: idLive,
          description: p.description ?? "",
          unitPrice: p.unitPrice,
          ...(p.unitPriceOverrides
            ? { unitPriceOverrides: p.unitPriceOverrides }
            : {}),
          billingCycle: p.billingCycle,
          ...(p.trialPeriod ? { trialPeriod: p.trialPeriod } : {}),
          taxMode: p.taxMode,
        });
        idLivePrecio = creado.id;
        console.log(`  + "${p.description}" creado en live (${idLivePrecio}).`);
      }
      if (!previo) {
        mapa.precios.push({
          sandbox: p.id,
          live: idLivePrecio,
          plan: nombre,
          ciclo: p.billingCycle.interval,
          descripcion: p.description ?? "",
        });
      }
    }
  }

  // ── 4) Token de cliente live (público) ──────────────────────────────────
  if (mapa.client_token_live) {
    console.log(
      `· Token de cliente live ya generado: ${mapa.client_token_live.slice(0, 10)}… (del mapa).`,
    );
  } else {
    const { json } = await rest(claveLive, "POST", "/client-tokens", {
      name: "MULTIFACTU web (precios y checkout)",
      description:
        "Página de precios y checkout de multifactu.vercel.app (Paddle.js).",
    });
    const datos = json.data as { token?: string; id?: string } | undefined;
    if (!datos?.token?.startsWith("live_")) {
      throw new Error("La respuesta de /client-tokens no trae un token live_.");
    }
    mapa.client_token_live = datos.token;
    console.log(`+ Token de cliente live (${datos.id}): ${datos.token}`);
    console.log("  (público por diseño: va a VITE_PADDLE_CLIENT_TOKEN.)");
  }

  // ── 5) Destino de notificación live (el secreto SÓLO viene al crear) ────
  if (mapa.destino_notificacion) {
    console.log(
      `· Destino de notificación ya existente: ${mapa.destino_notificacion.id}.`,
    );
  } else {
    const actuales = await rest(
      claveLive,
      "GET",
      "/notification-settings?per_page=100",
    );
    const destinos = (actuales.json.data ?? []) as Array<{
      id: string;
      type: string;
      destination: string;
    }>;
    const propio = destinos.find(
      (d) => d.type === "url" && d.destination === URL_WEBHOOK,
    );
    if (propio) {
      // Reutilizar; su secreto NO se puede recuperar por API. Si no se
      // conserva, se pide crear otro (nunca se borra nada).
      mapa.destino_notificacion = { id: propio.id, destination: propio.destination };
      console.log(
        `· Destino live ya apuntaba a nuestro webhook (${propio.id}) — se REUTILIZA.`,
      );
        console.log(
        "  ⚠ Si NO conservas su secreto de firma (pdl_ntfset_…), dímelo: la única",
        "  salida legal es crear un destino nuevo (no borramos entidades).",
      );
    } else {
      const { json } = await rest(claveLive, "POST", "/notification-settings", {
        description: "MULTIFACTU fulfillment (espejo de suscripciones)",
        type: "url",
        destination: URL_WEBHOOK,
        api_version: 1,
        // "all": eventos reales Y de simulación (el simulador es nuestra
        // puerta de verificación antes de cobrar de verdad).
        traffic_source: "all",
        subscribed_events: EVENTOS,
      });
      const datos = json.data as
        | { id?: string; endpoint_secret_key?: string }
        | undefined;
      if (!datos?.id || !datos.endpoint_secret_key) {
        throw new Error(
          "La respuesta de /notification-settings no trae id + endpoint_secret_key.",
        );
      }
      mapa.destino_notificacion = { id: datos.id, destination: URL_WEBHOOK };
      writeFileSync(ARCHIVO_SECRETO, datos.endpoint_secret_key, "utf8");
      console.log(
        `+ Destino de notificación live creado (${datos.id}) con los 6 eventos.`,
      );
      console.log(
        "  Secreto de firma guardado en .paddle-live-secret.txt (no en el chat).",
      );
    }
  }

  // ── 6) Mapa old→new ─────────────────────────────────────────────────────
  writeFileSync(ARCHIVO_MAPA, JSON.stringify(mapa, null, 2), "utf8");
  console.log("\n=== Correspondencia sandbox → live (para preciosPaddle.ts) ===");
  for (const p of mapa.precios) {
    console.log(`  ${p.plan} ${p.ciclo}: ${p.sandbox} → ${p.live}`);
  }
  console.log(`\nMapa completo en scripts/paddle-live-mapping.json.`);
}

migrar().catch((e) => {
  console.error(e);
  process.exit(1);
});
