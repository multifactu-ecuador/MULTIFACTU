-- Modo de alquiler: factura electronica (factura_sri) o venta interna (movements_caja, sin factura).
alter table public.contratos_alquiler
  add column if not exists modo text not null default 'FACTURA'
    check(modo in ('FACTURA','VENTA_INTERNA'));

create or replace function public.registrar_alquiler_interno(
 p_cliente uuid, p_items jsonb, p_metodo text, p_salida timestamptz, p_retorno timestamptz,
 p_garantia numeric, p_token uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=(select private.tenant_id()); c public.clientes%rowtype; e record;
 contrato uuid:=gen_random_uuid(); item jsonb; dias int; total_items numeric:=0;
 num int:=0; linea text; e_id uuid; e_precio numeric;
begin
 if t is null or not private.tiene_funcion('alquiler') then raise exception 'PLAN_REQUIRED: alquiler requiere Pro';end if;
 if p_metodo not in('01','16','18','19','20') or p_garantia<0 or p_salida is null or p_retorno is null or p_retorno<=p_salida then
  raise exception 'Datos inválidos';end if;
 select * into c from public.clientes where tenant_id=t and id=p_cliente;
 if not found then raise exception 'Cliente no encontrado';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':interno',0));
 for item in select value from jsonb_array_elements(p_items) loop
  select * into e from public.catalogo_maquinaria where tenant_id=t and id=(item->>'id')::uuid for update;
  if not found then raise exception 'Item fuera de tu empresa';end if;
  if e.tipo<>'EQUIPO' or e.estado<>'Disponible' or (item->>'cantidad')::numeric<>1 then raise exception 'Equipo no disponible';end if;
  if exists(select 1 from public.contratos_detalles d join public.contratos_alquiler a on a.id=d.contrato_id and a.tenant_id=d.tenant_id
   where d.tenant_id=t and d.equipo_id=e.id and a.estado='ACTIVO' and a.salida<p_retorno and a.retorno>p_salida) then
   raise exception 'Equipo reservado en esas fechas';end if;
  dias := greatest(1, ceil(extract(epoch from (p_retorno - p_salida))/86400)::int);
  total_items := total_items + e.precio * dias;
  num := num + 1;
  linea := linea || e.nombre || ' (' || dias || ' días) ';
 end loop;
 if num < 1 or total_items <= 0 then raise exception 'Selecciona al menos un equipo';end if;
 insert into public.contratos_alquiler(id,tenant_id,cliente_id,salida,retorno,garantia,estado,creado_por,modo)
 values(contrato,t,c.id,p_salida,p_retorno,p_garantia,'ACTIVO',auth.uid(),'VENTA_INTERNA');
 for item in select value from jsonb_array_elements(p_items) loop
  select id, precio into e_id, e_precio from public.catalogo_maquinaria where tenant_id=t and id=(item->>'id')::uuid;
  insert into public.contratos_detalles(tenant_id,contrato_id,equipo_id,tarifa_dia)
   values(t,contrato,e_id,e_precio);
 end loop;
 insert into public.movimientos_caja(tenant_id,tipo,monto,metodo_pago,categoria,descripcion,creado_por,token)
 values(t,'INGRESO',total_items,p_metodo,'ALQUILER_INTERNO',
  'Venta interna de alquiler: ' || linea || ' · Cliente: ' || c.nombre, auth.uid(), p_token);
 return contrato;
end$$;
revoke all on function public.registrar_alquiler_interno(uuid,jsonb,text,timestamptz,timestamptz,numeric,uuid) from public,anon;
grant execute on function public.registrar_alquiler_interno(uuid,jsonb,text,timestamptz,timestamptz,numeric,uuid) to authenticated;
