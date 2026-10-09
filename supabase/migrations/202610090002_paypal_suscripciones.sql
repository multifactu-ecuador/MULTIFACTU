-- PayPal Subscriptions sustituye a PayPhone como única pasarela de los
-- planes y el cobro pasa de compra puntual a SUSCRIPCIÓN AUTOMÁTICA
-- (Subscriptions API de PayPal, cobro mensual recurrente).
--
-- 1) pedidos_planes.modo acepta 'paypal' ('payphone' sigue válido en el
--    CHECK sólo para no invalidar pedidos históricos; ya no se crean) y
--    guarda el enlace de aprobación y el plan recurrente con el que se
--    creó la suscripción, datos con los que `confirm` valida el retorno.
-- 2) suscripciones guarda la suscripción de PayPal vinculada: con ella el
--    webhook distingue renovaciones, mantiene estado/fin de forma
--    idempotente y la página de planes puede cancelar la renovación.
-- 3) Dos tablas internas sólo para service_role: catálogo (producto, los
--    tres planes recurrentes y el webhook_id creados vía API, por
--    entorno sandbox/live) y ventas aplicadas (dedupe de webhooks).
-- 4) RPC de activación con referencia textual: el id de una suscripción
--    de PayPal (I-...) no es numérico como el transaction de PayPhone.
--    Sustituye a confirmar_pago_plan, que se retira con el adaptador.
alter table public.pedidos_planes
  drop constraint pedidos_planes_modo_check,
  add constraint pedidos_planes_modo_check check(modo in('demo','payphone','paypal'));
alter table public.pedidos_planes
  add column if not exists pago_url text,
  add column if not exists paypal_plan_id text;
comment on column public.pedidos_planes.pago_url is
  'Enlace de aprobación de la suscripción en PayPal (rel=approve).';
comment on column public.pedidos_planes.paypal_plan_id is
  'Plan recurrente de PayPal con el que se creó esta suscripción.';

alter table public.suscripciones
  add column if not exists paypal_subscription_id text unique,
  add column if not exists paypal_estado text;
comment on column public.suscripciones.paypal_subscription_id is
  'Suscripción de PayPal (I-...) vinculada; null si nunca hubo cobro automático.';
comment on column public.suscripciones.paypal_estado is
  'Último estado reportado por PayPal (ACTIVE, CANCELLED, SUSPENDED, ...)';

create table public.pagos_paypal_catalogo(
  clave text primary key check(clave ~ '^(sandbox|live):'),
  paypal_id text not null,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create table public.pagos_paypal_ventas(
  paypal_venta_id text primary key,
  suscripcion_id text not null,
  monto numeric(10,2),
  detalle jsonb not null default '{}'::jsonb,
  aplicado_en timestamptz not null default now()
);
-- Sin policies: el RLS deniega a todo cliente autenticado; sólo service_role
-- (bypassrls) usa estas tablas de conciliación desde las edge functions.
alter table public.pagos_paypal_catalogo enable row level security;
alter table public.pagos_paypal_ventas enable row level security;
revoke all on public.pagos_paypal_catalogo from anon, authenticated;
revoke all on public.pagos_paypal_ventas from anon, authenticated;
grant all on public.pagos_paypal_catalogo to service_role;
grant all on public.pagos_paypal_ventas to service_role;

-- Transición y activación en una sola transacción; repetir la misma
-- confirmación nunca añade un mes extra (referencia distinta = rechazo).
create function public.confirmar_suscripcion_paypal(p_pedido uuid,p_subscription text,p_total int,p_moneda text) returns void language plpgsql security definer set search_path='' as $$
declare p public.pedidos_planes; s public.suscripciones; periodo_desde timestamptz;begin
 select * into p from public.pedidos_planes where id=p_pedido for update;
 if not found or p.modo<>'paypal' or p.total_centavos<>p_total or p_moneda<>'USD' or coalesce(length(p_subscription),0)<8 then raise exception 'Pago no coincide';end if;
 if p.aplicado_en is not null then if p.payment_id<>p_subscription then raise exception 'Transacción distinta';end if;return;end if;
 if p.estado='CANCELADO' then raise exception 'Pedido cancelado';end if;
 select * into s from public.suscripciones where tenant_id=p.tenant_id for update;
 periodo_desde:=case when s.estado='active' and s.plan=p.plan and s.fin>now() then s.fin else now() end;
 update public.suscripciones set estado='active',plan=p.plan,inicio=now(),fin=periodo_desde+interval '1 month',paypal_subscription_id=p_subscription,paypal_estado='ACTIVE' where tenant_id=p.tenant_id;
 update public.pedidos_planes set estado='PAGADO',payment_id=p_subscription,aplicado_en=now() where id=p.id;
end$$;
revoke all on function public.confirmar_suscripcion_paypal(uuid,text,int,text) from public,anon,authenticated;
grant execute on function public.confirmar_suscripcion_paypal(uuid,text,int,text) to service_role;

-- El adaptador PayPhone queda retirado: su RPC sólo sabía confirmar pagos
-- numéricos de esa pasarela. Pedidos antiguos en modo 'payphone' quedan
-- inalterables en su tabla; el CHECK los conserva válidos.
drop function if exists public.confirmar_pago_plan(uuid,bigint,int,text);
