-- Auditoría de cambios críticos: quién, qué, cuándo, sobre qué entidad.
-- Los triggers registran inserciones/actualizaciones/borrados en las tablas
-- sensibles. Nadie escribe directo: el trigger (security definer) es el único
-- autor. Cada empresa SÓLO ve su propia auditoría. El detalle jamás incluye
-- contraseñas, claves, tokens ni contenido de archivos.
create table public.auditoria(
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.empresas(id) on delete cascade,
  actor_id uuid,                 -- quién (null = proceso de backend/sistema)
  accion text not null,          -- INSERT_facturas_sri, UPDATE_suscripciones, ...
  entidad text not null,         -- tabla afectada
  entidad_id uuid,
  detalle jsonb,                 -- metadatos NO sensibles (estado, total, plan)
  ip text,                       -- x-forwarded-for si está disponible
  creado_en timestamptz not null default now()
);
create index on public.auditoria(tenant_id, creado_en);
create index on public.auditoria(entidad, entidad_id);
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon, authenticated;
grant select on public.auditoria to authenticated;
create policy auditoria_read on public.auditoria for select to authenticated
  using(tenant_id=(select private.tenant_id()));

-- Triggers por tabla: cada función conoce los campos de su registro.
-- (Una función genérica con CASE sobre tg_table_name falla: PL/pgSQL
-- resuelve new.<campo> en runtime y evalúa todas las ramas.)
create or replace function private.auditar_facturas()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_facturas_sri',
    'facturas_sri',
    coalesce(new.id, old.id),
    jsonb_build_object('estado', new.estado, 'total', new.total, 'simulacion', new.simulacion),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$$;

create or replace function private.auditar_suscripciones()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_suscripciones',
    'suscripciones',
    coalesce(new.id, old.id),
    jsonb_build_object('plan', new.plan, 'estado', new.estado),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$$;

create or replace function private.auditar_proformas()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_proformas',
    'proformas',
    coalesce(new.id, old.id),
    jsonb_build_object('estado', new.estado, 'numero', new.numero, 'total', new.total),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$$;

create or replace function private.auditar_empresas()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(auth.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_empresas',
    'empresas',
    coalesce(new.id, old.id),
    jsonb_build_object('ruc', new.ruc),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$$;

create trigger auditoria_facturas
  after insert or update or delete on public.facturas_sri
  for each row execute function private.auditar_facturas();
create trigger auditoria_suscripciones
  after insert or update or delete on public.suscripciones
  for each row execute function private.auditar_suscripciones();
create trigger auditoria_proformas
  after insert or update or delete on public.proformas
  for each row execute function private.auditar_proformas();
create trigger auditoria_empresas
  after insert or update or delete on public.empresas
  for each row execute function private.auditar_empresas();