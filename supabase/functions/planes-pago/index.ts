// Compra y renovación de planes. PayPal Subscriptions es la única pasarela
// real: `prepare` crea la suscripción recurrente en PayPal y devuelve el
// enlace de aprobación; el comprador aprueba y PayPal redirige a
// /app/planes?subscription_id=…, donde `confirm` valida contra la API de
// PayPal (plan, referencia, importe y estado) antes de activar el mes con
// la RPC confirmar_suscripcion_paypal. `cancel` corta la renovación
// automática sin tocar el período ya pagado. En modo demo no se cobra.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";
import { verificarEntorno } from "../_shared/verificar.ts";
import {
  PLAN_BASE,
  totalesPlan,
  checkedLink,
  type PlanOrder,
} from "../_shared/pago-plan.ts";
import { apiPaypal, catalogoPaypal, modoPaypal } from "../_shared/paypal.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const SUB_ID = /^I-[0-9A-Za-z]{8,20}$/;

/** Estructura de la suscripción de PayPal que usa esta función. */
interface SuscripcionPaypal {
  id?: string;
  status?: string;
  plan_id?: string;
  custom_id?: string;
  billing_info?: {
    last_payment?: { amount?: { value?: string; currency_code?: string } };
  };
}

Deno.serve(async (req) => {
  const origin = Deno.env.get("APP_ORIGIN")?.replace(/\/$/, "");
  const cors = {
    "Access-Control-Allow-Origin": origin ?? "http://localhost:5173",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
  };
  const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  const url = Deno.env.get("SUPABASE_URL"),
    secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret || !origin)
    return json({ error: "Servicio no configurado" }, 503);
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Denegar por defecto: origen, método, sesión y rol ADMIN en un solo punto.
  const ctx = await guardar(req, "/planes-pago", cors, verificarEntorno);
  if (ctx instanceof Response) return ctx;
  const tenant = ctx.tenant;
  let activeOrder: string | undefined;
  try {
    const input = await req.json();
    const mode = Deno.env.get("PAYMENTS_MODE") ?? "demo";
    if (input.action === "prepare") {
      if (!["demo", "paypal"].includes(mode))
        return json({ error: "Compras deshabilitadas" }, 503);
      // El client id de PayPal es público por diseño: el frontend lo usa para
      // cargar el SDK oficial y abrir la ventana de aprobación del botón.
      // El secret nunca sale del servidor.
      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const sdk =
        mode === "paypal" && clientId
          ? { clientId, modo: modoPaypal() }
          : undefined;
      if (
        !Object.hasOwn(PLAN_BASE, input.plan) ||
        !UUID.test(input.token ?? "")
      )
        return json({ error: "Plan/token inválidos" }, 400);
      const count = await admin
        .from("pedidos_planes")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant)
        .gte("creado_en", new Date(Date.now() - 900000).toISOString());
      if (count.error) throw Error("Consulta falló");
      if ((count.count ?? 0) > 10)
        return json({ error: "Espera antes de crear más pedidos" }, 429);
      const rate = Number(Deno.env.get("PLAN_IVA_RATE") ?? 15);
      if (![0, 5, 15].includes(rate))
        throw Error("IVA de planes no configurado");
      const planClave = input.plan as keyof typeof PLAN_BASE;
      const totales = totalesPlan(planClave, rate);
      let result = await admin
        .from("pedidos_planes")
        .select("*")
        .eq("tenant_id", tenant)
        .eq("token", input.token)
        .maybeSingle();
      if (result.error) throw Error("Consulta de pedido falló");
      if (!result.data) {
        const id = crypto.randomUUID();
        const insertion = await admin
          .from("pedidos_planes")
          .insert({
            id,
            tenant_id: tenant,
            usuario_id: ctx.uid,
            plan: input.plan,
            token: input.token,
            client_tx: crypto.randomUUID().replaceAll("-", "").slice(0, 15),
            base_centavos: totales.base,
            iva_centavos: totales.iva,
            total_centavos: totales.total,
            modo: mode,
          })
          .select("*")
          .single();
        if (insertion.error) {
          result = await admin
            .from("pedidos_planes")
            .select("*")
            .eq("tenant_id", tenant)
            .eq("token", input.token)
            .single();
          if (result.error) throw Error("No se pudo crear el pedido");
        } else result = insertion;
      }
      const order = result.data as PlanOrder;
      if (order.plan !== input.plan)
        return json({ error: "Token utilizado con otro plan" }, 409);
      if (order.modo === "demo")
        return json({
          order,
          notice: "Pedido sin cobro real: no activa una suscripción.",
        });
      if (order.estado !== "PENDIENTE") return json({ order, sdk });
      // Suscripción vigente del mismo plan: se renueva sola, comprar otra
      // sólo duplicaría el cobro. Para otro plan sí se crea la nueva y la
      // anterior se cancela al confirmar.
      const vinculada = await admin
        .from("suscripciones")
        .select("plan,estado,fin,paypal_subscription_id")
        .eq("tenant_id", tenant)
        .maybeSingle();
      if (vinculada.error) throw Error("Consulta de suscripción falló");
      const sus = vinculada.data;
      if (
        sus?.paypal_subscription_id &&
        sus.estado === "active" &&
        sus.fin &&
        new Date(sus.fin) > new Date()
      ) {
        if (sus.plan === order.plan)
          return json(
            {
              error: `Tu plan ${order.plan} ya está activo y PayPal lo renueva automáticamente el ${new Date(
                sus.fin,
              ).toLocaleDateString("es-EC")}. No necesitas comprarlo de nuevo.`,
              order,
            },
            409,
          );
      }
      const locked = await admin
        .from("pedidos_planes")
        .update({ estado: "PREPARANDO" })
        .eq("id", order.id)
        .eq("tenant_id", tenant)
        .eq("estado", "PENDIENTE")
        .select("id")
        .maybeSingle();
      if (locked.error) throw Error("No se pudo preparar");
      if (!locked.data)
        return json({ order, sdk, status: "Preparación en curso" }, 202);
      activeOrder = order.id;
      const catalogo = await catalogoPaypal(admin, rate);
      const creada = await apiPaypal<{
        id?: string;
        links?: { rel: string; href: string }[];
      }>("/v1/billing/subscriptions", "POST", {
        plan_id: catalogo[planClave].planId,
        custom_id: `${tenant}:${order.client_tx}`,
        application_context: {
          brand_name: "MULTIFACTU",
          return_url: origin + "/app/planes",
          cancel_url: origin + "/app/planes?cancelled=1",
          user_action: "SUBSCRIBE_NOW",
          locale: "es-ES",
          payment_method: {
            payer_selected: "PAYPAL",
            payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
          },
        },
      });
      if (creada.status !== 201 || !creada.data?.id)
        throw Error("PayPal no creó la suscripción");
      const approve = checkedLink(
        creada.data.links?.find((l) => l.rel === "approve")?.href,
      );
      if (!approve)
        throw Error("PayPal no devolvió el enlace de aprobación");
      const save = await admin
        .from("pedidos_planes")
        .update({
          estado: "PREPARADO",
          payment_id: creada.data.id,
          pago_url: approve,
          paypal_plan_id: catalogo[planClave].planId,
        })
        .eq("id", order.id)
        .eq("tenant_id", tenant)
        .select("*")
        .single();
      if (save.error) throw Error("Resultado no guardado");
      return json({ order: save.data, sdk });
    }
    if (input.action === "confirm") {
      if (
        typeof input.subscriptionId !== "string" ||
        !SUB_ID.test(input.subscriptionId)
      )
        return json({ error: "Suscripción inválida" }, 400);
      // Tope de confirmaciones por empresa: 15 cada 15 minutos. Sin esto,
      // cada retorno de PayPal podría barrer la API sin límite alguno.
      const limite = await admin.rpc("registrar_intento_edge", {
        p_clave: `planes-confirm:${tenant}`,
        p_limite: 15,
        p_ventana_min: 15,
      });
      if (limite.error) throw limite.error;
      if (limite.data !== true)
        return json(
          { error: "Demasiados intentos de confirmación. Espera unos minutos." },
          429,
        );
      const result = await admin
        .from("pedidos_planes")
        .select("*")
        .eq("tenant_id", tenant)
        .eq("payment_id", input.subscriptionId)
        .maybeSingle();
      if (result.error || !result.data)
        return json({ error: "Pedido no encontrado" }, 404);
      const order = result.data as PlanOrder;
      if (order.modo !== "paypal")
        return json(
          { error: "Un pedido sin cobro real no puede activar un plan" },
          409,
        );
      if (order.aplicado_en) return json({ order });
      // La suscripción aprobada debe coincidir con el pedido en todo:
      // identificador, plan recurrente y referencia interna custom_id.
      const consulta = await apiPaypal<SuscripcionPaypal>(
        `/v1/billing/subscriptions/${order.payment_id}`,
        "GET",
      );
      if (consulta.status !== 200 || !consulta.data)
        return json(
          { error: "PayPal no reconoce esta suscripción" },
          409,
        );
      const sub = consulta.data;
      if (
        sub.id !== order.payment_id ||
        sub.plan_id !== order.paypal_plan_id ||
        sub.custom_id !== `${tenant}:${order.client_tx}`
      )
        return json(
          { error: "La suscripción aprobada no coincide con el pedido" },
          409,
        );
      if (!["APPROVED", "ACTIVE"].includes(sub.status ?? ""))
        return json(
          {
            error: `La suscripción está en estado ${sub.status ?? "desconocido"}; termina la aprobación en PayPal.`,
          },
          409,
        );
      // En el primer ciclo sin prueba, PayPal la deja APPROVED hasta que se
      // activa: la activación dispara el cobro inmediato del primer mes.
      let estado = sub.status;
      if (estado === "APPROVED") {
        await apiPaypal(
          `/v1/billing/subscriptions/${sub.id}/activate`,
          "POST",
          { plan_id: order.paypal_plan_id },
        );
        const despues = await apiPaypal<SuscripcionPaypal>(
          `/v1/billing/subscriptions/${sub.id}`,
          "GET",
        );
        estado = despues.data?.status ?? estado;
        sub.billing_info = despues.data?.billing_info ?? sub.billing_info;
      }
      if (estado !== "ACTIVE")
        return json(
          {
            error:
              "PayPal no activó la suscripción; espera unos segundos y confirma de nuevo.",
          },
          409,
        );
      const ultimo = sub.billing_info?.last_payment?.amount;
      const esperado = (order.total_centavos / 100).toFixed(2);
      if (
        ultimo &&
        (ultimo.value !== esperado || ultimo.currency_code !== "USD")
      )
        return json(
          { error: "El importe cobrado no coincide con el pedido" },
          409,
        );
      // Cambio de plan: cancelar la suscripción anterior ANTES de activar la
      // nueva; si no, PayPal seguiría cobrando las dos cada mes.
      const previa = await admin
        .from("suscripciones")
        .select("paypal_subscription_id")
        .eq("tenant_id", tenant)
        .maybeSingle();
      if (previa.error) throw Error("Consulta de suscripción falló");
      const anterior = previa.data?.paypal_subscription_id;
      if (anterior && anterior !== order.payment_id) {
        const cancelada = await apiPaypal(
          `/v1/billing/subscriptions/${anterior}/cancel`,
          "POST",
          { reason: "Cambio de plan en MULTIFACTU" },
        );
        // 204 cancelada; 404/422 ya estaba cancelada en PayPal.
        if (![204, 404, 422].includes(cancelada.status))
          throw Error("No se pudo cancelar la suscripción anterior");
      }
      const activacion = await admin.rpc("confirmar_suscripcion_paypal", {
        p_pedido: order.id,
        p_subscription: order.payment_id,
        p_total: order.total_centavos,
        p_moneda: "USD",
      });
      if (activacion.error)
        throw Error(
          "Pago verificado pero activación pendiente; revisar pedido",
        );
      const saved = await admin
        .from("pedidos_planes")
        .select("*")
        .eq("id", order.id)
        .eq("tenant_id", tenant)
        .single();
      if (saved.error) throw Error("Consulta de resultado falló");
      return json({ order: saved.data });
    }
    if (input.action === "cancel") {
      // Corta la renovación automática en PayPal; el período ya pagado
      // sigue vigente hasta su fecha de fin.
      const s = await admin
        .from("suscripciones")
        .select("paypal_subscription_id,plan,estado,fin,paypal_estado")
        .eq("tenant_id", tenant)
        .maybeSingle();
      if (s.error) throw Error("Consulta de suscripción falló");
      const id = s.data?.paypal_subscription_id;
      if (!id)
        return json(
          { error: "No hay una suscripción de PayPal vinculada a esta empresa" },
          404,
        );
      const cancelada = await apiPaypal(
        `/v1/billing/subscriptions/${id}/cancel`,
        "POST",
        { reason: "Cancelación solicitada en MULTIFACTU" },
      );
      if (![204, 404, 422].includes(cancelada.status))
        return json(
          { error: "PayPal no confirmó la cancelación; intenta de nuevo." },
          409,
        );
      const marcado = await admin
        .from("suscripciones")
        .update({ paypal_estado: "CANCELLED" })
        .eq("tenant_id", tenant)
        .eq("paypal_subscription_id", id)
        .select("plan,estado,inicio,fin,paypal_estado,paypal_subscription_id")
        .maybeSingle();
      if (marcado.error)
        throw Error("Cancelada en PayPal pero no registrada localmente");
      return json({
        suscripcion: marcado.data,
        aviso: "PayPal dejará de cobrar. El plan sigue activo hasta el fin del período ya pagado.",
      });
    }
    return json({ error: "Acción inválida" }, 400);
  } catch (e) {
    // Todos los throw de esta función son mensajes fijos (nunca llevan
    // credenciales): devolver la causa es lo único que permite diagnosticar
    // a distancia; el genérico solo no decía nada.
    const causa = e instanceof Error ? e.message : "";
    console.error("planes-pago:", causa || String(e));
    if (activeOrder)
      await admin
        .from("pedidos_planes")
        .update({ estado: "CONSULTAR" })
        .eq("id", activeOrder)
        .eq("tenant_id", tenant)
        .eq("estado", "PREPARANDO");
    return json(
      {
        error:
          causa ||
          "No se pudo confirmar la operación. Consulta el pedido antes de repetir un pago.",
      },
      502,
    );
  }
});
