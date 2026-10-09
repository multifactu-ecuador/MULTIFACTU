// Webhook de PayPal para el ciclo de vida de las suscripciones de plan.
//
// La ruta es pública a nivel de guard (PayPal no envía JWT: nos llama de
// servidor a servidor), pero NINGÚN evento se procesa antes de superar la
// verificación criptográfica de la propia API de PayPal
// (verify-webhook-signature con el webhook_id registrado en el catálogo).
// Los efectos son deliberadamente mínimos y conciliables:
//   - PAYMENT.SALE.COMPLETED: dedupe por id de venta y avanza `fin` hacia
//     next_billing_time (sólo hacia adelante): un webhook atrasado o
//     reenviado nunca duplica el período.
//   - BILLING.SUBSCRIPTION.*: reflejan el estado que PayPal reporta
//     (suspendida por fallos de cobro bloquea el acceso; cancelada deja el
//     plan activo hasta su fecha de fin).
//   - Reembolsos/reversas: se registran para conciliación, sin bajar el
//     plan automáticamente.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";
import { apiPaypal, modoPaypal } from "../_shared/paypal.ts";

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  // Denegar por defecto: sólo la ruta registrada, con la autenticación
  // criptográfica de PayPal resolviéndose más abajo.
  const ctx = await guardar(req, "/pagos-webhook");
  if (ctx instanceof Response) return ctx;
  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json({ error: "Servicio no configurado" }, 503);
  const bruto = await req.text();
  if (bruto.length > 200_000) return json({ error: "Cuerpo demasiado grande" }, 413);
  let evento: { event_type?: string; resource?: Record<string, unknown> };
  try {
    evento = JSON.parse(bruto);
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // 1) Verificación de la firma de transmisión: la API de PayPal valida la
  //    cabecera contra el certificado oficial y el webhook_id registrado.
  //    Sin SUCCESS no se escribe nada en la base de datos.
  const registro = await admin
    .from("pagos_paypal_catalogo")
    .select("paypal_id")
    .eq("clave", `${modoPaypal()}:webhook`)
    .maybeSingle();
  if (registro.error) throw Error("Catálogo de PayPal no disponible");
  const webhookId = registro.data?.paypal_id;
  if (!webhookId)
    return json({ error: "Webhook de PayPal sin registrar" }, 503);
  const h = (n: string) => req.headers.get(n) ?? "";
  const verificacion = await apiPaypal<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    "POST",
    {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: evento,
    },
  );
  if (
    verificacion.status !== 200 ||
    verificacion.data?.verification_status !== "SUCCESS"
  )
    return json({ error: "Firma no válida" }, 403);

  const tipo = evento.event_type ?? "";
  const recurso = evento.resource ?? {};
  const suscripcionId =
    typeof recurso.billing_agreement_id === "string"
      ? recurso.billing_agreement_id
      : typeof recurso.id === "string" && recurso.id.startsWith("I-")
        ? recurso.id
        : "";
  const estadoPaypal = typeof recurso.status === "string" ? recurso.status : "";

  // 2) Cobro de una renovación: única fuente que añade meses después del
  //    primero (que aplica la RPC al confirmar la compra).
  if (tipo === "PAYMENT.SALE.COMPLETED") {
    const venta = typeof recurso.id === "string" ? recurso.id : "";
    if (!venta || !suscripcionId) return json({ ok: true });
    const monto = Number(
      (recurso.amount as { total?: string } | undefined)?.total ?? 0,
    );
    const aplicada = await admin.from("pagos_paypal_ventas").insert({
      paypal_venta_id: venta,
      suscripcion_id: suscripcionId,
      monto: Number.isFinite(monto) ? monto : null,
    });
    // Clave primaria duplicada = renovación ya procesada (evento reenviado).
    if (aplicada.error) return json({ ok: true, repetido: true });
    const fila = await admin
      .from("suscripciones")
      .select("id,fin,estado")
      .eq("paypal_subscription_id", suscripcionId)
      .maybeSingle();
    if (fila.error || !fila.data)
      return json({ ok: true, desconocida: true });
    // next_billing_time marca el inicio del período que acaba de pagar: el
    // fin sólo avanza hacia adelante, jamás retrocede ni duplica.
    const destino = new Date(
      (recurso.billing_info as { next_billing_time?: string } | undefined)
        ?.next_billing_time ?? "",
    );
    if (!Number.isNaN(destino.getTime()) && destino > new Date(fila.data.fin)) {
      const sube = await admin
        .from("suscripciones")
        .update({
          fin: destino.toISOString(),
          // Un cobro exitoso levanta una suscripción suspendida.
          estado:
            fila.data.estado === "suspended" ? "active" : fila.data.estado,
        })
        .eq("id", fila.data.id)
        .eq("paypal_subscription_id", suscripcionId);
      if (sube.error) throw Error("Renovación no registrada");
    }
    return json({ ok: true });
  }

  // 3) Estados de la suscripción: sólo se refleja lo que PayPal reporta.
  //    SUSPENDED (fallos de cobro repetidos) y EXPIRED cortan el acceso;
  //    CANCELLED no: el plan sigue vigente hasta su fin ya pagado.
  if (suscripcionId && tipo.startsWith("BILLING.SUBSCRIPTION.")) {
    const cambio: Record<string, string> = {
      paypal_estado: estadoPaypal || "UPDATED",
    };
    if (tipo === "BILLING.SUBSCRIPTION.SUSPENDED") cambio.estado = "suspended";
    if (tipo === "BILLING.SUBSCRIPTION.EXPIRED") cambio.estado = "expired";
    const r = await admin
      .from("suscripciones")
      .update(cambio)
      .eq("paypal_subscription_id", suscripcionId);
    if (r.error) throw Error("Estado no registrado");
    return json({ ok: true });
  }

  // 4) Reembolsos y reversas: quedan registrados para conciliación.
  if (tipo === "PAYMENT.SALE.REFUNDED" || tipo === "PAYMENT.SALE.REVERSED") {
    await admin.from("pagos_paypal_ventas").insert({
      paypal_venta_id: `${tipo}:${h("paypal-transmission-id")}`,
      suscripcion_id: suscripcionId || "sin-suscripcion",
      detalle: { tipo, recurso },
    });
    return json({ ok: true });
  }
  return json({ ok: true });
});
