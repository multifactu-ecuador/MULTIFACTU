// Crea (o detecta sin duplicar) el catálogo de planes de MULTIFACTU en la
// cuenta SANDBOX de Paddle. Un producto con el mismo nombre no se duplica y
// un precio con la misma descripción tampoco: se puede re-ejecutar seguro.
//
// Uso:
//   $env:PADDLE_API_KEY="pdl_sdbx_..."   # Developer tools > Authentication
//   npx tsx scripts/seed-paddle-catalog.ts
//
// Importes en la denominación más pequeña como cadena: USD 6.99 = "699".
// Los USD coinciden con PLAN_BASE de supabase/functions/_shared/pago-plan.ts
// (el precio base de hoy; como Merchant of Record, Paddle añade el impuesto
// aplicable en el checkout). GB/IE/AU son precios locales de referencia —
// ajustar a gusto desde el panel o editando este script.
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const apiKey = process.env.PADDLE_API_KEY;
if (!apiKey) {
  console.error(
    "Falta PADDLE_API_KEY (clave sandbox pdl_sdbx_... con permisos product.write y price.write).",
  );
  process.exit(1);
}
if (!apiKey.startsWith("pdl_sdbx_")) {
  console.error(
    "La clave no parece de sandbox (debe empezar por pdl_sdbx_). Este script NO toca la cuenta live.",
  );
  process.exit(1);
}

const paddle = new Paddle(apiKey, { environment: Environment.sandbox });

/** Prueba gratuita de 7 días en todos los precios de suscripción. */
const PRUEBA_7_DIAS = { interval: "day", frequency: 7 } as const;

interface Importes {
  USD: string;
  GBP: string;
  EUR: string;
  AUD: string;
}

interface Plan {
  nombre: string;
  descripcion: string;
  mensual: Importes;
  anual: Importes;
}

const PLANES: Plan[] = [
  {
    nombre: "MULTIFACTU Inicial",
    descripcion:
      "Facturación electrónica para empezar: comprobantes XML/RIDE, inventario y clientes.",
    mensual: { USD: "699", GBP: "599", EUR: "649", AUD: "999" },
    anual: { USD: "6990", GBP: "5990", EUR: "6490", AUD: "9990" },
  },
  {
    nombre: "MULTIFACTU Pro",
    descripcion:
      "Para negocios en crecimiento: más comprobantes al mes, alquiler de equipos y proformas con aprobación en línea.",
    mensual: { USD: "1199", GBP: "999", EUR: "1099", AUD: "1699" },
    anual: { USD: "11990", GBP: "9990", EUR: "10990", AUD: "16990" },
  },
  {
    nombre: "MULTIFACTU Luxury",
    descripcion:
      "Todo desbloqueado: finanzas, análisis, facturación programada con IA y almacenamiento ampliado.",
    mensual: { USD: "1899", GBP: "1599", EUR: "1799", AUD: "2799" },
    anual: { USD: "18990", GBP: "15990", EUR: "17990", AUD: "27990" },
  },
];

/** Precio base en USD + referencia local por país (GB→GBP, IE→EUR, AU→AUD). */
function precios(v: Importes) {
  return {
    unitPrice: { amount: v.USD, currencyCode: "USD" },
    unitPriceOverrides: [
      {
        countryCodes: ["GB"],
        unitPrice: { amount: v.GBP, currencyCode: "GBP" },
      },
      {
        countryCodes: ["IE"],
        unitPrice: { amount: v.EUR, currencyCode: "EUR" },
      },
      {
        countryCodes: ["AU"],
        unitPrice: { amount: v.AUD, currencyCode: "AUD" },
      },
    ],
  };
}

async function seed() {
  const existentes = await paddle.products.list({ perPage: 100 });
  const salida: Array<Record<string, string>> = [];

  for (const plan of PLANES) {
    let producto = existentes.data.find((p) => p.name === plan.nombre);
    if (producto) {
      console.log(`· "${plan.nombre}" ya existe (${producto.id}) — no se duplica.`);
    } else {
      producto = await paddle.products.create({
        name: plan.nombre,
        taxCategory: "saas",
        description: plan.descripcion,
      });
      console.log(`+ "${plan.nombre}" creado (${producto.id}).`);
    }

    const delProducto = await paddle.prices.list({
      productId: producto.id,
      perPage: 100,
    });

    async function precioSiFalta(descripcion: string, crear: object) {
      const existe = delProducto.data.find((p) => p.description === descripcion);
      if (existe) {
        console.log(`  · "${descripcion}" ya existe (${existe.id}).`);
        return existe.id;
      }
      const creado = await paddle.prices.create({
        productId: producto.id,
        description: descripcion,
        ...crear,
      });
      console.log(`  + "${descripcion}" creado (${creado.id}).`);
      return creado.id;
    }

    const mensualId = await precioSiFalta(`${plan.nombre} mensual`, {
      ...precios(plan.mensual),
      billingCycle: { interval: "month", frequency: 1 },
      trialPeriod: PRUEBA_7_DIAS,
    });
    const anualId = await precioSiFalta(`${plan.nombre} anual`, {
      ...precios(plan.anual),
      billingCycle: { interval: "year", frequency: 1 },
      trialPeriod: PRUEBA_7_DIAS,
    });

    salida.push({
      plan: plan.nombre,
      productId: producto.id,
      mensualId,
      anualId,
    });
  }

  console.log("\n=== Correspondencia sandbox (guardar para el wiring) ===");
  console.log(JSON.stringify(salida, null, 2));
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
