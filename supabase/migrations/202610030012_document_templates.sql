-- Plantillas de documentos personalizables por empresa
create table if not exists public.plantillas_documento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.empresas(id),
  tipo text not null check(tipo in ('factura','nota_credito','contrato','orden_venta','recibo')),
  nombre text not null,
  es_predeterminada boolean not null default false,
  -- Configuración visual
  logo_url text,
  color_primario text default '#1e40af',
  color_secundario text default '#ffffff',
  fuente text default 'Helvetica',
  tamano_fuente_base int default 8,
  -- Contenido estructurado (JSON)
  cabecera jsonb default '{"mostrar_ruc":true,"mostrar_direccion":true,"mostrar_telefono":true,"mostrar_email":true}'::jsonb,
  pie_pagina jsonb default '{"texto_legal":"Este documento es una representacion grafica de un comprobante electronico","mostrar_qr":true,"mostrar_web":true}'::jsonb,
  -- Campos personalizados (array de objetos {clave, valor, mostrar_en})
  campos_personalizados jsonb default '[]'::jsonb,
  -- Plantilla HTML/CSS opcional (para avanzados)
  html_template text,
  css_template text,
  -- Metadatos
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(tenant_id, tipo, es_predeterminada)
);

alter table public.plantillas_documento enable row level security;

create policy template_read on public.plantillas_documento for select to authenticated
  using(tenant_id=(select private.tenant_id()));

create policy template_write on public.plantillas_documento for insert to authenticated
  with check(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN');

create policy template_update on public.plantillas_documento for update to authenticated
  using(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN')
  with check(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN');

create policy template_delete on public.plantillas_documento for delete to authenticated
  using(tenant_id=(select private.tenant_id()) and (select private.rol())='ADMIN');

-- Trigger para actualizado_en
create or replace function public.actualizar_timestamp() returns trigger language plpgsql set search_path='' as $$
begin new.actualizado_en = now(); return new; end$$;

drop trigger if exists plantillas_actualizado on public.plantillas_documento;
create trigger plantillas_actualizado before update on public.plantillas_documento for each row execute function public.actualizar_timestamp();

-- Índices
create index if not exists plantillas_tenant_tipo_idx on public.plantillas_documento(tenant_id, tipo);
create index if not exists plantillas_predeterminada_idx on public.plantillas_documento(tenant_id, tipo, es_predeterminada);