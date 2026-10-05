import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ShieldCheck, CreditCard } from "lucide-react";
import { plans } from "./Landing";
import { db, money } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type { PlanOrder } from "../../../supabase/functions/_shared/payphone.ts";
export default function Plans() {
  const { access, refresh } = useAuth();
  const [query] = useSearchParams();
  const [order, setOrder] = useState<PlanOrder | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const tokens = useRef<Record<string, string>>({});
  const confirmation = useRef("");
  async function invoke(body: Record<string, unknown>) {
    const r = await db().functions.invoke("planes-pago", { body });
    if (r.error) {
      let message = r.error.message;
      try {
        const details = await r.error.context.json();
        message = details.error ?? message;
      } catch {}
      throw Error(message);
    }
    return r.data as { order: PlanOrder; notice?: string };
  }
  async function buy(plan: string) {
    setBusy(true);
    setError("");
    try {
      tokens.current[plan] ??= crypto.randomUUID();
      const r = await invoke({
        action: "prepare",
        plan,
        token: tokens.current[plan],
      });
      setOrder(r.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const client = query.get("clientTransactionId"),
      transaction = Number(query.get("id"));
    if (!client || !Number.isSafeInteger(transaction) || transaction <= 0)
      return;
    const key = client + ":" + transaction;
    if (confirmation.current === key) return;
    confirmation.current = key;
    setBusy(true);
    void invoke({
      action: "confirm",
      clientTransactionId: client,
      transactionId: transaction,
    })
      .then(async (r) => {
        setOrder(r.order);
        await refresh();
      })
      .catch((e) => {
        confirmation.current = "";
        setError(e.message);
      })
      .finally(() => setBusy(false));
  }, [query.toString()]);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUSCRIPCIÓN / TU SIGUIENTE PASO</p>
          <h1>Elige cómo crecer.</h1>
          <p>
            Inicial, Pro y Luxury. Puedes cancelar cuando quieras dejando de
            renovar.
          </p>
        </div>
        <span className="pill">
          Actual:{" "}
          {access?.suscripcion.estado === "trial"
            ? "Prueba Luxury"
            : access?.suscripcion.plan}
        </span>
      </div>
      <p className="notice">
        Renovación por compra, sin débito automático. Renovar el mismo plan
        añade un mes al período vigente; cambiar a otro lo reemplaza
        inmediatamente por un mes, sin prorrateo. Los permisos cambian después
        de confirmar el pago real.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {query.has("cancelled") && (
        <p className="notice">
          Regresaste de un pago cancelado. No se considera pagado sólo por
          volver a esta página.
        </p>
      )}
      <div className="plans-grid app-plans">
        {plans.map((p) => (
          <article className="card" key={p.id}>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <div className="plan-price">
              ${p.price}
              <small> + IVA / mes</small>
            </div>
            {p.popular && (
              <span className="pill" style={{ background: "#4a6cff", color: "#fff" }}>
                Recomendado
              </span>
            )}
            <ul>
              {p.items.map((i) => (
                <li key={i}>
                  <Check size={15} />
                  {i}
                </li>
              ))}
            </ul>
            <button
              disabled={busy || access?.rol !== "ADMIN"}
              onClick={() => void buy(p.id)}
            >
              <CreditCard size={17} />
              Comprar {p.name}
            </button>
          </article>
        ))}
      </div>
      {order && (
        <section className="card payment-result">
          <ShieldCheck size={30} />
          <h2>
            {order.estado === "PAGADO"
              ? "Plan activado"
              : order.modo === "demo"
                ? "Pedido registrado"
                : "Tu pedido de " + order.plan}
          </h2>
          <p>
            Total del mes: <b>{money(order.total_centavos / 100)}</b> · base{" "}
            {money(order.base_centavos / 100)} + IVA{" "}
            {money(order.iva_centavos / 100)}
          </p>
          <p>
            Estado: {order.estado} · referencia {order.client_tx}
          </p>
          {order.modo === "demo" ? (
            <p className="notice">
              No se ha cobrado ni habilitado otro plan. Configura PayPhone Business y valida un pago real para activar suscripciones comerciales.
            </p>
          ) : order.estado === "PREPARADO" ? (
            <div className="payment-actions">
              <a className="button" href={order.pay_with_card ?? "#"}>
                Pagar con tarjeta ↗
              </a>
              <a
                className="button secondary"
                href={order.pay_with_payphone ?? "#"}
              >
                Pagar con PayPhone ↗
              </a>
            </div>
          ) : order.estado === "PAGADO" ? (
            <Link className="button" to="/app">
              Volver a mi sistema
            </Link>
          ) : (
            <p className="notice">
              Revisa el pedido antes de generar otro cobro. La confirmación debe
              llegar desde el proveedor.
            </p>
          )}
        </section>
      )}
      <small>
        La emisión está en fase de validación: sin validez tributaria hasta
        activar el SRI real; contratar un plan no cambia ese estado.
      </small>
    </section>
  );
}
