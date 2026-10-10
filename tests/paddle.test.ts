// Capa de fulfillment de Paddle: reglas de acceso de pago y enrutado de
// eventos verificados del webhook a las tablas espejo. Se ejecutan en Node
// (módulos sin dependencias, doctrina de _shared/guard.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { otorgaAcceso } from "../supabase/functions/_shared/paddle-acceso.ts";
import {
  procesarEvento,
  type ClienteAdmin,
  type EventoPaddle,
} from "../supabase/functions/paddle-webhook/procesar.ts";

// ── Ayuda de acceso: active/trialing/past_due sí; paused/canceled no ──────
test("otorgaAcceso concede el pago a active, trialing y past_due", () => {
  assert.equal(otorgaAcceso({ estado: "active" }), true);
  assert.equal(otorgaAcceso({ estado: "trialing" }), true);
  assert.equal(otorgaAcceso({ estado: "past_due" }), true);
});

test("otorgaAcceso corta paused y canceled", () => {
  assert.equal(otorgaAcceso({ estado: "paused" }), false);
  assert.equal(otorgaAcceso({ estado: "canceled" }), false);
});

test("otorgaAcceso deniega por defecto: sin fila o estado desconocido", () => {
  assert.equal(otorgaAcceso(null), false);
  assert.equal(otorgaAcceso(undefined), false);
  assert.equal(otorgaAcceso({ estado: "" }), false);
  assert.equal(otorgaAcceso({ estado: "inventado" }), false);
});

// ── Enrutado de eventos verificados ───────────────────────────────────────
interface Llamada {
  tabla: string;
  fila: Record<string, unknown>;
  onConflict: string | undefined;
}

/** Cliente admin falso: registra los upserts y puede simular fallos. */
function adminFalso(fallo: { code?: string; message: string } | null = null) {
  const llamadas: Llamada[] = [];
  const admin: ClienteAdmin = {
    from(tabla: string) {
      return {
        upsert(fila: Record<string, unknown>, opciones?: { onConflict?: string }) {
          if (fallo) return Promise.resolve({ error: fallo });
          llamadas.push({ tabla, fila, onConflict: opciones?.onConflict });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, llamadas };
}

const evento = (
  eventType: string,
  data: object,
): EventoPaddle => ({ eventId: "evt_1", eventType, data });

test("subscription.created hace upsert idempotente por subscription_id", async () => {
  const { admin, llamadas } = adminFalso();
  await procesarEvento(
    evento("subscription.created", {
      id: "sub_1",
      status: "trialing",
      customerId: "ctm_1",
      currencyCode: "USD",
      nextBilledAt: "2026-10-17T00:00:00Z",
      currentBillingPeriod: { from: "2026-10-10T00:00:00Z", to: "2026-11-10T00:00:00Z" },
      scheduledChange: null,
      items: [{ price: { id: "pri_1", productId: "pro_1" } }],
    }),
    admin,
  );
  assert.equal(llamadas.length, 1);
  const { tabla, fila, onConflict } = llamadas[0];
  assert.equal(tabla, "paddle_suscripciones");
  assert.equal(onConflict, "subscription_id");
  assert.equal(fila.subscription_id, "sub_1");
  assert.equal(fila.customer_id, "ctm_1");
  assert.equal(fila.estado, "trialing");
  assert.equal(fila.price_id, "pri_1");
  assert.equal(fila.product_id, "pro_1");
  assert.equal(fila.moneda, "USD");
  assert.equal(fila.proximo_cobro_en, "2026-10-17T00:00:00Z");
  assert.equal(fila.periodo_desde, "2026-10-10T00:00:00Z");
  assert.equal(fila.cambio_accion, null);
});

test("subscription.updated guarda el cambio programado como aviso, no como corte", async () => {
  const { admin, llamadas } = adminFalso();
  await procesarEvento(
    evento("subscription.updated", {
      id: "sub_1",
      status: "active", // sigue activa: el acceso NO se revoca aún
      customerId: "ctm_1",
      scheduledChange: { action: "cancel", effectiveAt: "2026-11-01T00:00:00Z" },
      items: [{ price: { id: "pri_1", productId: "pro_1" } }],
    }),
    admin,
  );
  const fila = llamadas[0].fila;
  assert.equal(fila.estado, "active");
  assert.equal(fila.cambio_accion, "cancel");
  assert.equal(fila.cambio_en, "2026-11-01T00:00:00Z");
  // El espejo decide acceso sólo por estado; el aviso es informational.
  assert.equal(otorgaAcceso({ estado: fila.estado as string }), true);
});

test("customer.created refleja el puente email → customer_id", async () => {
  const { admin, llamadas } = adminFalso();
  await procesarEvento(
    evento("customer.created", { id: "ctm_9", email: "compra@ejemplo.com" }),
    admin,
  );
  assert.equal(llamadas[0].tabla, "paddle_clientes");
  assert.equal(llamadas[0].onConflict, "customer_id");
  assert.equal(llamadas[0].fila.email, "compra@ejemplo.com");
});

test("transaction.completed registra el cobro con su total", async () => {
  const { admin, llamadas } = adminFalso();
  await procesarEvento(
    evento("transaction.completed", {
      id: "txn_1",
      status: "completed",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      currencyCode: "USD",
      details: { totals: { total: "11.99" } },
    }),
    admin,
  );
  assert.equal(llamadas[0].tabla, "paddle_transacciones");
  assert.equal(llamadas[0].onConflict, "transaction_id");
  assert.equal(llamadas[0].fila.monto_total, 11.99);
  assert.equal(llamadas[0].fila.subscription_id, "sub_1");
});

test("un evento sin handler se ignora sin escribir ni lanzar", async () => {
  const { admin, llamadas } = adminFalso();
  await procesarEvento(evento("price.updated", { id: "pri_x" }), admin);
  await procesarEvento(evento("subscription.past_due", { id: "sub_x" }), admin);
  assert.equal(llamadas.length, 0);
});

test("un payload sin id/customerId no escribe (y no simula éxito)", async () => {
  const { admin, llamadas } = adminFalso();
  await procesarEvento(evento("subscription.updated", { id: "sub_y" }), admin);
  await procesarEvento(evento("customer.updated", {}), admin);
  assert.equal(llamadas.length, 0);
});

test("un fallo de escritura se propaga (el webhook responderá no-2xx)", async () => {
  const { admin } = adminFalso({ code: "23503", message: "fk pendiente" });
  await assert.rejects(
    procesarEvento(
      evento("subscription.created", {
        id: "sub_1",
        status: "active",
        customerId: "ctm_aun_no_espejado",
        items: [],
      }),
      admin,
    ),
    /no reflejada/,
  );
});
