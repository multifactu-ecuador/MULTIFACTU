-- Bitácora de preguntas del asistente público de la web: límite anti-abuso
-- por IP (15 preguntas por hora). Sólo service_role la usa; nadie más la toca.
create table public.asistente_web_intentos(
  id bigint generated always as identity primary key,
  ip text not null,
  creado_en timestamptz not null default now()
);
create index on public.asistente_web_intentos(ip, creado_en);
alter table public.asistente_web_intentos enable row level security;
revoke all on public.asistente_web_intentos from anon, authenticated;
grant select, insert on public.asistente_web_intentos to service_role;
