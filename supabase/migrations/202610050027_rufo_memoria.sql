-- RUFO aprende de cada empresa por separado: memoria del negocio, hallazgos
-- que el ADMIN confirma o descarta y valoración de las respuestas. El
-- asistente sólo propone hallazgos: nunca decide ni ejecuta acciones.
create table public.rufo_memoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.empresas(id) on delete cascade,
  clave text not null,
  valor text not null,
  origen text not null default 'aprendido' check (origen in ('declarado','aprendido')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create unique index rufo_memoria_unica on public.rufo_memoria(tenant_id, clave, valor);
create index rufo_memoria_activa on public.rufo_memoria(tenant_id) where activo;

create table public.rufo_aprendizaje (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.empresas(id) on delete cascade,
  clave text not null,
  tipo text not null check (tipo in ('riesgo','oportunidad','patron')),
  titulo text not null,
  detalle text not null,
  evidencia jsonb not null default '{}'::jsonb,
  periodo text not null default '',
  estado text not null default 'propuesto' check (estado in ('propuesto','confirmado','descartado')),
  creado_en timestamptz not null default now(),
  revisado_en timestamptz
);
-- Un mismo hallazgo se propone como máximo una vez por periodo (sin duplicar).
create unique index rufo_aprendizaje_unica on public.rufo_aprendizaje(tenant_id, clave, periodo);
create index rufo_aprendizaje_estado on public.rufo_aprendizaje(tenant_id, estado, creado_en desc);

create table public.rufo_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.empresas(id) on delete cascade,
  pregunta text not null,
  respuesta text not null,
  util boolean not null,
  creado_en timestamptz not null default now()
);
create index rufo_feedback_tenant on public.rufo_feedback(tenant_id, creado_en desc);

-- Control de cuándo corrió por última vez el análisis semanal (una fila/empresa).
create table public.rufo_control (
  tenant_id uuid primary key references public.empresas(id) on delete cascade,
  ultimo_analisis timestamptz not null default now()
);

alter table public.rufo_memoria enable row level security;
alter table public.rufo_aprendizaje enable row level security;
alter table public.rufo_feedback enable row level security;
alter table public.rufo_control enable row level security;

-- En producción los default privileges de Supabase otorgan todo a
-- authenticated; aquí se hace explícito. Las políticas siguen mandando.
grant select on public.rufo_memoria, public.rufo_aprendizaje, public.rufo_feedback to authenticated;

-- Lectura sólo para el ADMIN de la misma empresa. El navegador jamás escribe
-- en estas tablas: lo hace el asistente con service role (confirma, olvida,
-- guarda feedback). rufo_control no tiene política ni grant: invisible al cliente.
create policy rufo_memoria_read on public.rufo_memoria for select to authenticated
  using(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN');
create policy rufo_aprendizaje_read on public.rufo_aprendizaje for select to authenticated
  using(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN');
create policy rufo_feedback_read on public.rufo_feedback for select to authenticated
  using(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN');
