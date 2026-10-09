import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ShieldCheck, CreditCard } from "lucide-react";
import { plans } from "./Landing";
import { db, money } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type { PlanOrder } from "../../../supabase/functions/_shared/pago-plan.ts";
export default function Plans() {
  const { access, refresh } = useAuth();
  const [query] = useSearchParams();
  const [order, setOrder] = useState<PlanOrder | null>(null),
    [error, setError] = useState(""),
    [aviso, setAviso] = useState(""),
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
    return r.data as {
      order?: PlanOrder;
      aviso?: string;
      notice?: string;
    };
  }
  async function buy(plan: string) {
    setBusy(true);
    setError("");
    setAviso("");
    try {
      tokens.current[plan] ??= crypto.randomUUID();
      const r = await invoke({
        action: "prepare",
        plan,
        token: tokens.current[plan],
      });
      if (r.order) setOrder(r.order);
      // PayPal: seguir de inmediato al enlace de aprobación (rel=approve).
      if (
        r.order?.modo === "paypal" &&
        r.order.estado === "PREPARADO" &&
        r.order.pago_url
      )
        window.location.assign(r.order.pago_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setBusy(false);
    }
  }
  async function cancelar() {
    if (
      !window.confirm(
        "PayPal dejará de cobrar este plan. Seguirás con todas las funciones hasta el fin del período ya pagado.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const r = await invoke({ action: "cancel" });
      setAviso(r.aviso ?? "Renovación cancelada.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cancelar");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    // PayPal redirige de vuelta a /app/planes con el id de la suscripción
    // aprobada; la confirmación se hace contra su API, nunca en cliente.
    const subscription = query.get("subscription_id");
    if (!subscription) return;
    if (confirmation.current === subscription) return;
    confirmation.current = subscription;
    setBusy(true);
    void invoke({ action: "confirm", subscriptionId: subscription })
      .then(async (r) => {
        if (r.order) setOrder(r.order);
        await refresh();
      })
      .catch((e) => {
        confirmation.current = "";
        setError(e.message);
      })
      .finally(() => setBusy(false));
  }, [query.toString()]);
  const vinculada = access?.suscripcion.paypal_subscription_id;
  const cancelada = access?.suscripcion.paypal_estado === "CANCELLED";
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUSCRIPCIÓN / TU SIGUIENTE PASO</p>
          <h1>Elige cómo crecer.</h1>
          <p>
            Inicial, Pro y Luxury. Puedes cancelar la renovación cuando
            quieras.
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
        Renovación automática con PayPal: cada mes se cobra el total del plan
        vigente. Puedes cancelar cuando quieras y el plan sigue activo hasta el
        fin del período ya pagado; cambiar de plan reemplaza el período
        inmediatamente, sin prorrateo. Los permisos cambian después de
        confirmar el pago real.
      </p>
      {vinculada && access?.suscripcion.estado === "active" && (
        <p className="notice">
          Suscripción automática activa ({access.suscripcion.plan}): PayPal la
          cobra el{" "}
          {new Date(access.suscripcion.fin).toLocaleDateString("es-EC")}.{" "}
          {cancelada ? (
            "La renovación está cancelada: seguirá activa hasta esa fecha."
          ) : (
            <button
              type="button"
              className="linklike"
              disabled={busy}
              onClick={() => void cancelar()}
            >
              Cancelar renovación automática
            </button>
          )}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {aviso && <p className="notice">{aviso}</p>}
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
              <span className="pill" style={{ background: "#CDFF28", color: "#0a0a0a" }}>
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
              No se ha cobrado ni habilitado otro plan. Configura PayPal
              (PAYPAL_CLIENT_ID, PAYPAL_SECRET y PAYMENTS_MODE=paypal) y valida
              un pago real para activar suscripciones comerciales.
            </p>
          ) : order.estado === "PREPARADO" && order.pago_url ? (
            <div className="payment-actions">
              <a className="button" href={order.pago_url}>
                Continuar con PayPal ↗
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
