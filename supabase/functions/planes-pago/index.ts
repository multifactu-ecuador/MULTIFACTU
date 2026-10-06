import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { guardar } from "../_shared/guard.ts";
import { verificarEntorno } from "../_shared/verificar.ts";
import {
  PLAN_BASE,
  provider,
  checkedLink,
  validPayment,
  type PlanOrder,
} from "../_shared/payphone.ts";
const UUID = /^[0-9a-f-]{36}$/i;
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
      if (!["demo", "payphone"].includes(mode))
        return json({ error: "Compras deshabilitadas" }, 503);
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
      const base = PLAN_BASE[input.plan as keyof typeof PLAN_BASE];
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
            base_centavos: base,
            iva_centavos: Math.round((base * rate) / 100),
            total_centavos: base + Math.round((base * rate) / 100),
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
      if (order.estado !== "PENDIENTE") return json({ order });
      const token = Deno.env.get("PAYPHONE_TOKEN"),
        store = Deno.env.get("PAYPHONE_STORE_ID");
      if (!token || !store)
        return json(
          { error: "Configura PayPhone Business; no se procesó ningún cobro" },
          503,
        );
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
        return json({ order, status: "Preparación en curso" }, 202);
      activeOrder = order.id;
      const value = await provider(
        "Prepare",
        {
          amount: order.total_centavos,
          amountWithTax: order.iva_centavos ? order.base_centavos : 0,
          amountWithoutTax: order.iva_centavos ? 0 : order.base_centavos,
          tax: order.iva_centavos,
          service: 0,
          tip: 0,
          currency: "USD",
          clientTransactionId: order.client_tx,
          storeId: store,
          reference: "MULTIFACTU " + order.plan + " · un mes",
          responseUrl: origin + "/app/planes",
          cancellationUrl: origin + "/app/planes?cancelled=1",
          timeZone: -5,
        },
        token,
      );
      const save = await admin
        .from("pedidos_planes")
        .update({
          estado: "PREPARADO",
          payment_id: String(value.paymentId),
          pay_with_card: checkedLink(value.payWithCard),
          pay_with_payphone: checkedLink(value.payWithPayPhone),
        })
        .eq("id", order.id)
        .eq("tenant_id", tenant)
        .select("*")
        .single();
      if (save.error) throw Error("Resultado no guardado");
      return json({ order: save.data });
    }
    if (input.action === "confirm") {
      if (
        typeof input.clientTransactionId !== "string" ||
        input.clientTransactionId.length > 50 ||
        !Number.isSafeInteger(input.transactionId) ||
        input.transactionId <= 0
      )
        return json({ error: "Transacción inválida" }, 400);
      // Tope de confirmaciones por empresa: 15 cada 15 minutos. Sin esto,
      // el barrido de transacciones contra V2/Confirm de PayPhone no tenía
      // límite alguno (sólo `prepare` lo tenía).
      const limite = await admin.rpc("registrar_intento_edge", {
        p_clave: `planes-confirm:${tenant}`,
        p_limite: 15,
        p_ventana_min: 15,
      });
      if (limite.error) throw limite.error;
      if (limite.data !== true)
        return json({ error: "Demasiados intentos de confirmación. Espera unos minutos." }, 429);
      const result = await admin
        .from("pedidos_planes")
        .select("*")
        .eq("tenant_id", tenant)
        .eq("client_tx", input.clientTransactionId)
        .single();
      if (result.error) return json({ error: "Pedido no encontrado" }, 404);
      const order = result.data as PlanOrder;
      if (order.modo !== "payphone")
        return json({ error: "Un pedido sin cobro real no puede activar un plan" }, 409);
      if (order.aplicado_en) return json({ order });
      const token = Deno.env.get("PAYPHONE_TOKEN");
      if (!token) return json({ error: "Proveedor sin configurar" }, 503);
      const response = await provider(
        "V2/Confirm",
        { id: input.transactionId, clientTxId: order.client_tx },
        token,
      );
      if (validPayment(response, order, input.transactionId)) {
        const activation = await admin.rpc("confirmar_pago_plan", {
          p_pedido: order.id,
          p_transaction: input.transactionId,
          p_total: order.total_centavos,
          p_moneda: "USD",
        });
        if (activation.error)
          throw Error(
            "Pago verificado pero activación pendiente; revisar pedido",
          );
      } else {
        const cancel = await admin
          .from("pedidos_planes")
          .update({ estado: "CANCELADO" })
          .eq("id", order.id)
          .eq("tenant_id", tenant)
          .is("aplicado_en", null);
        if (cancel.error) throw Error("No se pudo registrar cancelación");
      }
      const saved = await admin
        .from("pedidos_planes")
        .select("*")
        .eq("id", order.id)
        .eq("tenant_id", tenant)
        .single();
      if (saved.error) throw Error("Consulta de resultado falló");
      return json({ order: saved.data });
    }
    return json({ error: "Acción inválida" }, 400);
  } catch {
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
          "No se pudo confirmar la operación. Consulta el pedido antes de repetir un pago.",
      },
      502,
    );
  }
});
