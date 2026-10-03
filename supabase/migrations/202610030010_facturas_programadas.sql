-- Facturas programadas (solo Luxury): plantillas recurrentes de facturación.
create table if not exists public.facturas_programadas (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.empresas(id),
 cliente_id uuid not null,
 items jsonb not null,              -- [{id, cantidad, descuento}]
 metodo_pago text not null check(metodo_pago in ('01','16','18','19','20')),
 credito_dias int not null default 0 check(credito_dias between 0 and 365),
 periodicidad text not null check(periodicidad in ('diaria','semanal','mensual')),
 dia_mes smallint check(dia_mes between 1 and 31),          -- para mensual
 dia_semana smallint check(dia_semana between 0 and 6),     -- para semanal
 proxima_fecha date not null,
 activa boolean not null default true,
 creada_en timestamptz not null default now(),
 unique(tenant_id, id),
 foreign key(tenant_id, cliente_id) references public.clientes(tenant_id, id)
);
create index if not exists facturas_programadas_due on public.facturas_programadas(tenant_id, proxima_fecha) where activa;

-- RPC para crear una factura programada (solo Luxury ADMIN)
create or replace function public.crear_factura_programada(
 p_cliente uuid, p_items jsonb, p_metodo text, p_credito int,
 p_periodicidad text, p_dia_mes int, p_dia_semana int, p_inicio date)
returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=(select private.tenant_id()); n uuid:=gen_random_uid(); s public.suscripciones%rowtype;
begin
 select * into s from public.suscripciones where tenant_id=t;
 if s.plan<>'luxury' or s.estado not in ('trial','active') then raise exception 'PLAN_REQUIRED: solo Luxury activo';end if;
 if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'Ítems requeridos';end if;
 if p_metodo not in ('01','16','18','19','20') then raise exception 'Método inválido';end if;
 if p_periodicidad='mensual' and (p_dia_mes is null or p_dia_mes<1 or p_dia_mes>31) then raise exception 'Día de mes 1-31';end if;
 if p_periodicidad='semanal' and (p_dia_semana is null or p_dia_semana<0 or p_dia_semana>6) then raise exception 'Día semana 0-6';end if;
 if p_inicio < (now() at time zone 'America/Guayaquil')::date then raise exception 'Fecha inicio no pasada';end if;
 insert into public.facturas_programadas(tenant_id, cliente_id, items, metodo_pago, credito_dias, periodicidad, dia_mes, dia_semana, proxima_fecha, activa)
 values(t, p_cliente, p_items, p_metodo, p_credito, p_periodicidad, p_dia_mes, p_dia_semana, p_inicio, true)
 returning id into n;
 return n;
end$$;
revoke all on function public.crear_factura_programada(uuid,jsonb,text,int,text,int,int,date) from public,anon;
grant execute on function public.crear_factura_programada(uuid,jsonb,text,int,text,int,int,date) to authenticated;

-- Worker: procesar facturas programadas vencidas (invocar via cron cada día)
create or replace function public.procesar_facturas_programadas() returns int language plpgsql security definer set search_path='' as $$
declare rec record; cnt int:=0; f uuid;
begin
 for rec in select * from public.facturas_programadas where activa and proxima_fecha <= (now() at time zone 'America/Guayaquil')::date loop
  -- crear factura real usando crear_factura existente
  perform public.crear_factura(
    rec.cliente_id,
    rec.items,
    gen_random_uuid()::text,
    rec.metodo_pago,
    rec.credito_dias,
    'VENTA',
    null, null, 0
  );
  -- avanzar próxima fecha
  if rec.periodicidad='diaria' then
   update public.facturas_programadas set proxima_fecha = proxima_fecha + interval '1 day' where id=rec.id;
  elsif rec.periodicidad='semanal' then
   update public.facturas_programadas set proxima_fecha = proxima_fecha + interval '7 days' where id=rec.id;
  elsif rec.periodicidad='mensual' then
   update public.facturas_programadas set proxima_fecha = (date_trunc('month', proxima_fecha) + interval '1 month' + (rec.dia_mes-1) * interval '1 day')::date where id=rec.id;
  end if;
  cnt := cnt + 1;
 end loop;
 return cnt;
end$$;
revoke all on function public.procesar_facturas_programadas() from public,anon;
grant execute on function public.procesar_facturas_programadas() to service_role;

-- RLS
alter table public.facturas_programadas enable row level security;
create policy fp_read on public.facturas_programadas for select to authenticated using(tenant_id=(select private.tenant_id()) and private.tiene_funcion('programada'));
create policy fp_insert on public.facturas_programadas for insert to authenticated with check(tenant_id=(select private.tenant_id()) and private.tiene_funcion('programada') and (select private.rol())='ADMIN');
create policy fp_update on public.facturas_programadas for update to authenticated using(tenant_id=(select private.tenant_id()) and private.tiene_funcion('programada') and (select private.rol())='ADMIN') with check(tenant_id=(select private.tenant_id()) and private.tiene_funcion('programada'));
create policy fp_delete on public.facturas_programadas for delete to authenticated using(tenant_id=(select private.tenant_id()) and private.tiene_funcion('programada') and (select private.rol())='ADMIN');