-- Bitácora de intentos de verificación de contraseña .p12.
-- La Edge Function verificar-p12 la usa como límite anti fuerza-bruta
-- (máx. 10 intentos cada 15 minutos por empresa). Nadie con clave
-- anon/authenticated puede leerla ni escribirla: sólo service_role.
create table public.p12_verify_intentos(
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.empresas(id) on delete cascade,
  creado_en timestamptz not null default now()
);
create index on public.p12_verify_intentos(tenant_id, creado_en);
alter table public.p12_verify_intentos enable row level security;
revoke all on public.p12_verify_intentos from anon, authenticated;
grant select, insert on public.p12_verify_intentos to service_role;
