// Modelo de pedido de plan compartido entre el navegador (Plans.tsx) y las
// edge functions de pago. Módulo PURO: sin Deno ni fetch, para que el
// typecheck del cliente pueda importarlo sin arrastrar runtime de servidor.

export interface PlanOrder {
  id: string;
  tenant_id: string;
  usuario_id: string;
  plan: "inicial" | "pro" | "luxury";
  token: string;
  client_tx: string;
  base_centavos: number;
  iva_centavos: number;
  total_centavos: number;
  /** 'payphone' sólo sobrevive en pedidos históricos; ya no se crean. */
  modo: "demo" | "payphone" | "paypal";
  estado: string;
  /** Id de la suscripción de PayPal (I-...). */
  payment_id: string | null;
  /** Enlace de aprobación en PayPal (rel=approve). */
  pago_url: string | null;
  /** Plan recurrente de PayPal con el que se creó la suscripción. */
  paypal_plan_id: string | null;
  aplicado_en: string | null;
  transaction_id: number | null;
}

export const PLAN_BASE = { inicial: 699, pro: 1199, luxury: 1899 } as const;

/** Totales en centavos: la misma fórmula para el pedido y para el precio
 *  recorrente que PayPal cobra cada mes (base + IVA redondeado). */
export function totalesPlan(plan: keyof typeof PLAN_BASE, ivaRate: number) {
  const base = PLAN_BASE[plan];
  const iva = Math.round((base * ivaRate) / 100);
  return { base, iva, total: base + iva };
}

/** Nombre descriptivo del plan recurrente en el catálogo de PayPal. */
export const nombrePlan = (plan: keyof typeof PLAN_BASE) =>
  `MULTIFACTU ${plan === "inicial" ? "Inicial" : plan === "pro" ? "Pro" : "Luxury"}`;

/** Sólo acepta enlaces del propio PayPal: evita guardar una URL robada o
 *  manipulada como destino de cobro en la tabla de pedidos. */
export const checkedLink = (
  valor: unknown,
  esperado = "https://www.paypal.com/",
) => (typeof valor === "string" && valor.startsWith(esperado) ? valor : "");
