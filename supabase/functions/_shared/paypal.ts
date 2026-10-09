// Cliente PayPal (Subscriptions API v1) para el cobro automático de los
// planes. Todo pasa por api-m.paypal.com: token OAuth2 de credenciales de
// app (PAYPAL_CLIENT_ID/PAYPAL_SECRET) cacheado en memoria, y el catálogo
// —producto, tres planes recurrentes y webhook de eventos— se crea vía API
// la primera vez y queda registrado en pagos_paypal_catalogo por entorno
// (sandbox/live), de modo que repetir la operación es idempotente.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { totalesPlan, nombrePlan } from "./pago-plan.ts";

export type PlanClave = "inicial" | "pro" | "luxury";

/** 'live' cobra dinero real; por defecto sandbox. */
export const modoPaypal = () =>
  Deno.env.get("PAYPAL_MODE") === "live" ? "live" : "sandbox";

export const apiBase = () =>
  modoPaypal() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

/** Eventos suscritos al webhook: renovaciones, fallos de cobro, cancelaciones. */
export const EVENTOS_PAYPAL = [
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
] as const;

let cache: { token: string; expira: number } | null = null;

async function paypalToken(): Promise<string> {
  if (cache && cache.expira > Date.now() + 60_000) return cache.token;
  const id = Deno.env.get("PAYPAL_CLIENT_ID"),
    secreto = Deno.env.get("PAYPAL_SECRET");
  if (!id || !secreto) throw Error("PayPal no configurado");
  const r = await fetch(apiBase() + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${id}:${secreto}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw Error("PayPal rechazó las credenciales de la aplicación");
  const t = (await r.json()) as { access_token: string; expires_in?: number };
  cache = {
    token: t.access_token,
    expira: Date.now() + Number(t.expires_in ?? 3200) * 1000,
  };
  return cache.token;
}

/** Llamada autenticada a la API de PayPal. Devuelve el estado HTTP real:
 *  los callers deciden (201 al crear, 204 al cancelar, 422 si ya estaba
 *  cancelada, etc.) en vez de tratar todo error como excepción. */
export async function apiPaypal<T>(
  ruta: string,
  metodo: "GET" | "POST",
  cuerpo?: unknown,
): Promise<{ status: number; data: T | null }> {
  const r = await fetch(apiBase() + ruta, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await paypalToken()}`,
      "Content-Type": "application/json",
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let data: T | null = null;
  try {
    data = texto ? (JSON.parse(texto) as T) : null;
  } catch {
    data = null;
  }
  return { status: r.status, data };
}

export interface PlanPaypal {
  planId: string;
  precioCentavos: number;
}

/**
 * Asegura el catálogo en el entorno activo y devuelve los tres planes con
 * su precio mensual (total con IVA, igual que el pedido). Si el IVA cambia
 * se crea un plan nuevo con el precio correcto y se reemplaza la entrada:
 * un plan recurrente de PayPal no admite editar su precio.
 */
export async function catalogoPaypal(
  db: SupabaseClient,
  ivaRate: number,
): Promise<Record<PlanClave, PlanPaypal>> {
  const entorno = modoPaypal();
  const leer = async (clave: string) => {
    const r = await db
      .from("pagos_paypal_catalogo")
      .select("paypal_id,detalle")
      .eq("clave", clave)
      .maybeSingle();
    if (r.error) throw Error("Catálogo de PayPal no disponible");
    return r.data as
      | { paypal_id: string; detalle: Record<string, unknown> }
      | null;
  };
  const guardar = async (
    clave: string,
    paypalId: string,
    detalle: Record<string, unknown>,
  ) => {
    const r = await db
      .from("pagos_paypal_catalogo")
      .upsert({
        clave,
        paypal_id: paypalId,
        detalle,
        actualizado_en: new Date().toISOString(),
      })
      .select("paypal_id")
      .single();
    if (r.error) throw Error("Catálogo de PayPal no guardado");
  };

  // 1) Producto: contenedor de los planes del servicio.
  let producto = await leer(`${entorno}:producto`);
  if (!producto) {
    const creado = await apiPaypal<{ id?: string }>("/v1/catalogs/products", "POST", {
      name: "MULTIFACTU",
      description: "Facturación electrónica para Ecuador",
      category: "SOFTWARE",
    });
    if (creado.status !== 201 || !creado.data?.id)
      throw Error("PayPal no creó el producto");
    await guardar(`${entorno}:producto`, creado.data.id, {});
    producto = { paypal_id: creado.data.id, detalle: {} };
  }

  // 2) Webhook: sin él no llegan renovaciones ni fallos de cobro. Se
  //    registra ya con todos los eventos para no depender de una segunda
  //    pasada manual.
  const webhook = await leer(`${entorno}:webhook`);
  if (!webhook) {
    const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
    if (!base) throw Error("SUPABASE_URL no configurado");
    const creado = await apiPaypal<{ id?: string }>("/v1/notifications/webhooks", "POST", {
      url: `${base}/functions/v1/pagos-webhook`,
      event_types: EVENTOS_PAYPAL.map((name) => ({ name })),
    });
    if (creado.status !== 201 || !creado.data?.id)
      throw Error("PayPal no registró el webhook");
    await guardar(`${entorno}:webhook`, creado.data.id, {});
  }

  // 3) Los planes recurrentes: sólo se (re)crean si aún no existen o si el
  //    precio mensual calculado ya no coincide con el registrado.
  const salida = {} as Record<PlanClave, PlanPaypal>;
  for (const plan of ["inicial", "pro", "luxury"] as const) {
    const { total } = totalesPlan(plan, ivaRate);
    const clave = `${entorno}:plan:${plan}`;
    const guardado = await leer(clave);
    if (guardado && Number(guardado.detalle.precio) === total) {
      salida[plan] = { planId: guardado.paypal_id, precioCentavos: total };
      continue;
    }
    const creado = await apiPaypal<{ id?: string }>("/v1/billing/plans", "POST", {
      product_id: producto.paypal_id,
      name: nombrePlan(plan),
      description: `${nombrePlan(plan)}: facturación electrónica, suscripción mensual.`,
      billing_cycles: [
        {
          // La API actual exige interval_unit/interval_count; el clásico
          // unit/value devuelve 400 INVALID_PARAMETER_VALUE en /billing/plans.
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: (total / 100).toFixed(2), currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: "0.00", currency_code: "USD" },
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    });
    if (creado.status !== 201 || !creado.data?.id)
      throw Error(`PayPal no creó el plan ${plan}`);
    await guardar(clave, creado.data.id, { precio: total, moneda: "USD" });
    salida[plan] = { planId: creado.data.id, precioCentavos: total };
  }
  return salida;
}
