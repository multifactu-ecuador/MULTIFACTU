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
  modo: "demo" | "payphone";
  estado: string;
  pay_with_card: string | null;
  pay_with_payphone: string | null;
  aplicado_en: string | null;
  transaction_id: number | null;
}
export const PLAN_BASE = { inicial: 699, pro: 1199, luxury: 1899 } as const;
export function validPayment(
  result: Record<string, unknown>,
  order: PlanOrder,
  transaction: number,
) {
  if (
    result.clientTransactionId !== order.client_tx ||
    result.transactionId !== transaction ||
    result.amount !== order.total_centavos ||
    result.currency !== "USD" ||
    ![2, 3].includes(Number(result.statusCode))
  )
    throw Error("Confirmación no coincide con el pedido");
  return result.statusCode === 3;
}
export async function provider(
  path: string,
  payload: unknown,
  token: string,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(
    "https://pay.payphonetodoesposible.com/api/button/" + path,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw Error("Proveedor no confirmó la operación");
  const data = await response.json();
  if (data.errorCode) throw Error("Proveedor rechazó la operación");
  return data as Record<string, unknown>;
}
export function checkedLink(value: unknown) {
  if (typeof value !== "string") throw Error("URL de pago ausente");
  const u = new URL(value);
  if (u.protocol !== "https:" || u.hostname !== "pay.payphonetodoesposible.com")
    throw Error("URL del proveedor no reconocida");
  return u.href;
}
