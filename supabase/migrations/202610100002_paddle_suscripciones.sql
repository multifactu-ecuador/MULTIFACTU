-- Paddle (Merchant of Record) es la venta internacional de planes desde
-- /precios: suscripción con prueba de 7 días y cobro recurrente en USD/GBP/
-- EUR/AUD. Los eventos VERIFICADOS del webhook /paddle-webhook espejan aquí
-- el estado real de clientes, suscripciones y transacciones. Nada se escribe
-- desde el navegador: RLS cerrado y sólo service_role, igual que las tablas
-- de conciliación de PayPal (pagos_paypal_*).
--
-- private.paddle_acceso decide si una suscripción otorga pago hoy:
--   - active / trialing: sí (vigente o en la prueba gratuita).
--   - past_due: sí, con aviso — Paddle reintenta el cobro (dunning) y
--     cortar el acceso de golpe castigaría a quien ya va a pagar.
--   - paused / canceled: no.
--   - Cualquier estado desconocido: NO (denegar por defecto).
-- Un cambio programado (scheduled_change de cancel/pause con effective_at
-- futuro) NO baja el acceso: sólo el estado real 'canceled' lo corta, cuando
-- Paddle lo confirma con su evento. Los campos cambio_* guardan ese aviso
-- para la interfaz, nunca para decidir acceso.
create table public.paddle_clientes(
  customer_id text primary key, -- ctm_… asignado por Paddle
  email text not null,          -- puente con usuarios_perfiles.email
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
-- Búsqueda del customer_id por email del usuario autenticado (portal).
create index paddle_clientes_email_idx on public.paddle_clientes (lower(email));

create table public.paddle_suscripciones(
  subscription_id text primary key, -- sub_… asignado por Paddle
  -- FK al cliente espejo: Paddle crea el customer antes que la suscripción.
  -- Si un evento llega fuera de orden, el upsert falla y el webhook responde
  -- no-2xx para que Paddle reintente hasta que el cliente exista.
  customer_id text not null references public.paddle_clientes(customer_id),
  estado text not null,             -- active|trialing|past_due|paused|canceled
  price_id text not null,           -- pri_… (mensual o anual del tier)
  product_id text not null,         -- pro_… (Inicial|Pro|Luxury)
  moneda text,
  proximo_cobro_en timestamptz,
  periodo_desde timestamptz,
  periodo_hasta timestamptz,
  cambio_accion text,               -- cancel|pause programado (aviso, no corte)
  cambio_en timestamptz,            -- effective_at del cambio programado
  detalle jsonb not null default '{}'::jsonb, -- payload crudo, conciliación
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index paddle_suscripciones_customer_idx on public.paddle_suscripciones (customer_id);
create index paddle_suscripciones_estado_idx on public.paddle_suscripciones (estado);

-- Cobros completados (transaction.completed): se registran para
-- conciliación y facturación; una compra única ni siquiera tiene
-- suscripción, por eso customer_id/subscription_id admiten null y no hay
-- FK (los eventos pueden llegar fuera de orden; el espejo sólo refleja).
create table public.paddle_transacciones(
  transaction_id text primary key, -- txn_… asignado por Paddle
  customer_id text,
  subscription_id text,
  estado text not null,
  moneda text,
  monto_total numeric(10,2),
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Sin policies: el RLS deniega a todo cliente; sólo service_role (desde las
-- edge functions de fulfillment) usa estas tablas.
alter table public.paddle_clientes enable row level security;
alter table public.paddle_suscripciones enable row level security;
alter table public.paddle_transacciones enable row level security;
revoke all on public.paddle_clientes from anon, authenticated;
revoke all on public.paddle_suscripciones from anon, authenticated;
revoke all on public.paddle_transacciones from anon, authenticated;
grant all on public.paddle_clientes to service_role;
grant all on public.paddle_suscripciones to service_role;
grant all on public.paddle_transacciones to service_role;

-- ¿Esta suscripción otorga acceso de pago hoy? Espejo TS en
-- _shared/paddle-acceso.ts (mismas reglas). SECURITY DEFINER porque el
-- caller (service_role) consulta una tabla con RLS cerrado; se ejecuta sólo
-- desde el servidor para que nadie sondee estados ajenos.
create function private.paddle_acceso(p_suscripcion text) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(
    (select estado in ('active','trialing','past_due')
       from public.paddle_suscripciones
      where subscription_id = p_suscripcion),
    false)
$$;
revoke all on function private.paddle_acceso(text) from public, anon, authenticated;
grant execute on function private.paddle_acceso(text) to service_role;
