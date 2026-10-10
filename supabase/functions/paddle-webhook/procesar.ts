// Enrutado y aplicación de los eventos VERIFICADOS de Paddle a las tablas
// espejo (paddle_clientes, paddle_suscripciones, paddle_transacciones).
//
// Tres garantías, todas heredadas del contrato de entrega de Paddle:
//   - Entrega at-least-once y fuera de orden: cada handler es un UPSERT
//     keyed en el id de Paddle, así que un reenvío converge y un
//     subscription.updated que llegue antes que su created no pierde nada.
//   - Nunca se responde 2xx ante un fallo de escritura: si Postgres falla
//     se lanza el error y la function responde no-2xx para que Paddle
//     reintente (el webhook de PayPal sigue la misma doctrina).
//   - Los eventos no suscritos o sin handler se ignoran con seguridad:
//     un no-op es mejor que un throw que quemaría el presupuesto de
//     reintentos por algo que nunca vamos a procesar.
//
// Sin ledger de eventos (processed_webhooks): no hay efectos no idempotentes
// (nada de correos ni créditos de una sola vez todavía); el upsert basta.
//
// Módulo sin dependencias (como _shared/guard.ts) para poder importarse y
// testearse en Node (tests/paddle.test.ts): los tipos de evento son
// interfaces propias estructuralmente compatibles con las del SDK.
export interface ClienteAdmin {
  from(tabla: string): {
    upsert(
      fila: Record<string, unknown>,
      opciones?: { onConflict?: string },
    ): PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
}

export interface EventoPaddle {
  eventId: string;
  eventType: string;
  data: object;
}

const comoTexto = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/** Aplica un evento verificado. Lanza ante cualquier fallo de escritura. */
export async function procesarEvento(
  evento: EventoPaddle,
  admin: ClienteAdmin,
): Promise<void> {
  switch (evento.eventType) {
    case "customer.created":
    case "customer.updated":
      return reflejarCliente(evento.data, admin);
    case "subscription.created":
    case "subscription.updated":
    case "subscription.canceled":
      return reflejarSuscripcion(evento.data, admin);
    case "transaction.completed":
      return reflejarTransaccion(evento.data, admin);
    default:
      return; // tipo suscrito sin handler u otro evento: ignorado.
  }
}

/** customer.created/customer.updated: puente email → customer_id con el
 *  que paddle-portal resuelve la sesión del usuario autenticado. Si un
 *  cliente llegara sin email no hay puente posible: se ignora (con log). */
async function reflejarCliente(data: object, admin: ClienteAdmin) {
  const d = data as Record<string, unknown>;
  const id = comoTexto(d.id);
  const email = comoTexto(d.email);
  if (!id || !email) {
    console.error("paddle-webhook: cliente sin id/email, ignorado");
    return;
  }
  const r = await admin.from("paddle_clientes").upsert(
    {
      customer_id: id,
      email,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "customer_id" },
  );
  if (r.error) throw Error(`Cliente ${id} no reflejado: ${r.error.message}`);
}

/** subscription.created/updated/canceled: el estado que gobierna el acceso
 *  (private.paddle_acceso). El cambio programado se guarda como aviso; el
 *  acceso lo decide sólo el estado real. Si el cliente espejo aún no existe
 *  (evento fuera de orden), la FK falla → no-2xx → Paddle reintenta. */
async function reflejarSuscripcion(data: object, admin: ClienteAdmin) {
  const d = data as Record<string, unknown>;
  const id = comoTexto(d.id);
  const cliente = comoTexto(d.customerId);
  if (!id || !cliente) {
    console.error("paddle-webhook: suscripción sin id/customerId, ignorada");
    return;
  }
  const items = Array.isArray(d.items)
    ? (d.items as Array<Record<string, unknown>>)
    : [];
  const precio = items[0]?.price as
    | Record<string, unknown>
    | null
    | undefined;
  const cambio = d.scheduledChange as
    | Record<string, unknown>
    | null
    | undefined;
  const periodo = d.currentBillingPeriod as
    | Record<string, unknown>
    | null
    | undefined;
  const r = await admin.from("paddle_suscripciones").upsert(
    {
      subscription_id: id,
      customer_id: cliente,
      estado: comoTexto(d.status) ?? "",
      price_id: comoTexto(precio?.id) ?? "",
      product_id: comoTexto(precio?.productId) ?? "",
      moneda: comoTexto(d.currencyCode),
      proximo_cobro_en: comoTexto(d.nextBilledAt),
      periodo_desde: comoTexto(periodo?.from),
      periodo_hasta: comoTexto(periodo?.to),
      cambio_accion: comoTexto(cambio?.action),
      cambio_en: comoTexto(cambio?.effectiveAt),
      detalle: d,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "subscription_id" },
  );
  if (r.error)
    throw Error(`Suscripción ${id} no reflejada: ${r.error.message}`);
}

/** transaction.completed: cobro completado (primer cobro tras la prueba o
 *  una renovación). Se registra para conciliación; el total sale de
 *  details.totals.total y se ignora si no viene. */
async function reflejarTransaccion(data: object, admin: ClienteAdmin) {
  const d = data as Record<string, unknown>;
  const id = comoTexto(d.id);
  if (!id) {
    console.error("paddle-webhook: transacción sin id, ignorada");
    return;
  }
  const detalles = d.details as Record<string, unknown> | null | undefined;
  const totales = detalles?.totals as Record<string, unknown> | null | undefined;
  const total = Number(comoTexto(totales?.total));
  const r = await admin.from("paddle_transacciones").upsert(
    {
      transaction_id: id,
      customer_id: comoTexto(d.customerId),
      subscription_id: comoTexto(d.subscriptionId),
      estado: comoTexto(d.status) ?? "",
      moneda: comoTexto(d.currencyCode),
      monto_total: Number.isFinite(total) ? total : null,
      detalle: d,
      actualizado_en: new Date().toISOString(),
    },
    { onConflict: "transaction_id" },
  );
  if (r.error)
    throw Error(`Transacción ${id} no reflejada: ${r.error.message}`);
}
