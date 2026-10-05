-- Corrección de facturación programada:
-- 1) crear_factura_programada usaba gen_random_uid() (no existe) y guardaba
--    dia_mes/dia_semana=0, violando los CHECK de la tabla.
-- 2) procesar_facturas_programadas llamaba a public.crear_factura, que exige
--    sesión (auth.uid()/private.tenant_id()): el cron no tiene sesión, así que
--    ninguna factura programada podía emitirse. Además pasaba el token como
--    text en vez de uuid.
-- Solución: private.crear_factura_core recibe tenant y creador explícitos;
-- public.crear_factura queda como envoltorio que resuelve la sesión. El motor
-- usa el núcleo con el ADMIN de cada empresa como creador.

-- Variante de tiene_funcion parametrizada por tenant (usable sin sesión).
create or replace function private.tiene_funcion_para(p_tenant uuid, funcion text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select s.estado in ('trial','active') and now()>=s.inicio and now()<s.fin and
  (funcion in ('facturacion','inventario','clientes','servicios','proformas') or
  (funcion='alquiler' and (s.estado='trial' or s.plan in('pro','luxury'))) or
  (funcion in ('finanzas','analisis','programada') and (s.estado='trial' or s.plan='luxury')))
  from public.suscripciones s where s.tenant_id=p_tenant),false)
$$;
create or replace function private.tiene_funcion(funcion text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.tiene_funcion_para(private.tenant_id(),funcion)
$$;

-- Núcleo de creación de facturas con tenant/creador explícitos.
-- Misma lógica transaccional de la migración 003 (precios del catálogo,
-- idempotencia por token, reservas de alquiler, stock, secuencial atómico).
create or replace function private.crear_factura_core(
 p_tenant uuid, p_creado_por uuid,
 p_cliente uuid, p_items jsonb, p_token uuid, p_metodo text, p_credito_dias int,
 p_tipo text, p_salida timestamptz, p_retorno timestamptz, p_garantia numeric
) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=p_tenant; e public.empresas; c public.clientes; producto public.catalogo_maquinaria;
 f uuid:=gen_random_uuid(); contrato uuid; numero bigint; item jsonb; cantidad numeric; precio numeric; base numeric; descuento numeric;
 impuesto numeric; detalle text; dias int; viejo public.facturas_sri;
 solicitud jsonb:=jsonb_build_object('cliente',p_cliente,'items',p_items,'metodo',p_metodo,'credito',p_credito_dias,'tipo',p_tipo,'salida',p_salida,'retorno',p_retorno,'garantia',p_garantia);
begin
 if t is null or not private.tiene_funcion_para(t,'facturacion') then raise exception 'PLAN_REQUIRED: acceso vencido';end if;
 if p_tipo not in('VENTA','ALQUILER') or p_metodo not in('01','16','18','19','20') or p_credito_dias not between 0 and 365 or p_garantia<0 then raise exception 'Datos inválidos';end if;
 if p_credito_dias>0 and not private.tiene_funcion_para(t,'finanzas') then raise exception 'PLAN_REQUIRED: crédito requiere Luxury';end if;
 if p_tipo='ALQUILER' and not private.tiene_funcion_para(t,'alquiler') then raise exception 'PLAN_REQUIRED: alquiler requiere Pro';end if;
 if p_tipo='VENTA' and (p_garantia<>0 or p_salida is not null or p_retorno is not null) then raise exception 'Garantía/fechas sólo corresponden al alquiler';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 ítems';end if;
 -- Serializa operaciones por empresa; garantiza idempotencia y reservas de equipos.
 perform pg_advisory_xact_lock(hashtextextended(t::text||':factura',0));
 select * into viejo from public.facturas_sri where tenant_id=t and token=p_token;
 if found then if viejo.solicitud<>solicitud then raise exception 'Token usado con otra operación';end if;return viejo.id;end if;
 select * into e from public.empresas where id=t;
 select * into c from public.clientes where tenant_id=t and id=p_cliente;
 if not found then raise exception 'Cliente inexistente en tu empresa';end if;
 if p_tipo='ALQUILER' then
 if p_salida is null or p_retorno is null or p_retorno<=p_salida then raise exception 'Período inválido';end if;
 dias:=ceil(extract(epoch from(p_retorno-p_salida))/86400)::int;
 if dias>3660 then raise exception 'Período demasiado largo';end if;
 contrato:=gen_random_uuid();
 insert into public.contratos_alquiler(id,tenant_id,cliente_id,salida,retorno,garantia,creado_por) values(contrato,t,c.id,p_salida,p_retorno,p_garantia,p_creado_por);
 end if;
 insert into public.secuenciales_sri(tenant_id,ambiente,establecimiento,punto_emision,tipo,ultimo)
 values(t,e.ambiente_sri,e.establecimiento,e.punto_emision,'01',1)
 on conflict(tenant_id,ambiente,establecimiento,punto_emision,tipo) do update set ultimo=public.secuenciales_sri.ultimo+1 returning ultimo into numero;
 insert into public.facturas_sri(id,tenant_id,cliente_id,contrato_id,creado_por,token,ambiente_sri,establecimiento,punto_emision,secuencial,metodo_pago,credito_dias,emisor_snapshot,cliente_snapshot,solicitud)
 values(f,t,c.id,contrato,p_creado_por,p_token,e.ambiente_sri,e.establecimiento,e.punto_emision,numero,p_metodo,p_credito_dias,
 jsonb_build_object('ruc',coalesce(e.ruc,'1790016919001'),'razon_social',e.razon_social,'direccion',e.direccion,'regimen',coalesce(e.regimen,'general'),'obligado_contabilidad',e.obligado_contabilidad),to_jsonb(c),solicitud);
 for item in select value from jsonb_array_elements(p_items) loop
 select * into producto from public.catalogo_maquinaria where tenant_id=t and id=(item->>'id')::uuid for update;
 if not found then raise exception 'Ítem fuera de tu empresa';end if;
 if exists(select 1 from public.factura_detalles where factura_id=f and catalogo_id=producto.id) then raise exception 'Ítem repetido';end if;
 cantidad:=(item->>'cantidad')::numeric;
 descuento:=coalesce((item->>'descuento')::numeric,0);
 if cantidad is null or cantidad<=0 or cantidad>100000 or cantidad<>round(cantidad,3) or descuento<0 or descuento<>round(descuento,2) then raise exception 'Cantidad/descuento inválidos';end if;
 precio:=producto.precio;detalle:=producto.nombre;
 if producto.tipo='EQUIPO' then
 if p_tipo<>'ALQUILER' or cantidad<1 or producto.estado<>'Disponible' then raise exception 'Equipo no disponible para alquiler';end if;
 if exists(select 1 from public.contratos_detalles d join public.contratos_alquiler a on a.id=d.contrato_id and a.tenant_id=d.tenant_id
 where d.tenant_id=t and d.equipo_id=producto.id and a.estado='ACTIVO' and a.salida<p_retorno and a.retorno>p_salida) then raise exception 'Equipo reservado en esas fechas';end if;
 precio:=precio*dias;
 detalle:='Alquiler de '||producto.nombre||' · '||dias||' días ['||to_char(p_salida at time zone 'America/Guayaquil','DD/Mon HH24:MI')||' — '||to_char(p_retorno at time zone 'America/Guayaquil','DD/Mon HH24:MI')||']';
 insert into public.contratos_detalles(tenant_id,contrato_id,equipo_id,tarifa_dia) values(t,contrato,producto.id,producto.precio);
 elsif producto.tipo='PRODUCTO' then
 if producto.stock<cantidad then raise exception 'Stock insuficiente';end if;
 update public.catalogo_maquinaria set stock=stock-cantidad where id=producto.id and tenant_id=t;
 end if;
 base:=round(cantidad*precio,2)-descuento;if base<0 then raise exception 'Descuento superior al importe';end if;
 impuesto:=round(base*producto.iva/100,2);
 insert into public.factura_detalles(tenant_id,factura_id,catalogo_id,descripcion,cantidad,precio,costo_snapshot,descuento,iva,base,impuesto)
 values(t,f,producto.id,detalle,cantidad,precio,producto.costo,descuento,producto.iva,base,impuesto);
 end loop;
 if p_tipo='ALQUILER' and not exists(select 1 from public.contratos_detalles where contrato_id=contrato) then raise exception 'Selecciona al menos un equipo';end if;
 update public.facturas_sri set
 subtotal_0=(select coalesce(sum(d.base),0) from public.factura_detalles d where factura_id=f and iva=0),
 subtotal_5=(select coalesce(sum(d.base),0) from public.factura_detalles d where factura_id=f and iva=5),
 subtotal_15=(select coalesce(sum(d.base),0) from public.factura_detalles d where factura_id=f and iva=15),
 descuentos=(select coalesce(sum(d.descuento),0) from public.factura_detalles d where factura_id=f),
 iva_5=(select coalesce(sum(d.impuesto),0) from public.factura_detalles d where factura_id=f and iva=5),
 iva_15=(select coalesce(sum(d.impuesto),0) from public.factura_detalles d where factura_id=f and iva=15),
 total=(select sum(d.base+d.impuesto) from public.factura_detalles d where factura_id=f)
 where id=f and tenant_id=t;
 insert into public.cuotas(tenant_id,factura_id,cliente_id,vencimiento,monto)
 select t,f,c.id,fecha+p_credito_dias,total from public.facturas_sri where id=f and total>0;
 -- Emitir no declara el cobro; un abono explícito lo registra en caja.
 return f;
end$$;

-- Envoltorio público: resuelve tenant y usuario desde la sesión del navegador.
create or replace function public.crear_factura(
 p_cliente uuid, p_items jsonb, p_token uuid, p_metodo text default '20', p_credito_dias int default 0,
 p_tipo text default 'VENTA', p_salida timestamptz default null, p_retorno timestamptz default null,
 p_garantia numeric default 0
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  return private.crear_factura_core(private.tenant_id(), auth.uid(), p_cliente, p_items, p_token, p_metodo, p_credito_dias, p_tipo, p_salida, p_retorno, p_garantia);
end$$;

-- crear_factura_programada corregida: gen_random_uuid y días normalizados a
-- NULL cuando no aplican (los CHECK de la tabla exigen 1-31 / 0-6 o NULL).
create or replace function public.crear_factura_programada(
 p_cliente uuid, p_items jsonb, p_metodo text, p_credito int,
 p_periodicidad text, p_dia_mes int, p_dia_semana int, p_inicio date)
returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=(select private.tenant_id()); n uuid:=gen_random_uuid(); s public.suscripciones%rowtype;
begin
 select * into s from public.suscripciones where tenant_id=t;
 if s.plan<>'luxury' or s.estado not in ('trial','active') then raise exception 'PLAN_REQUIRED: solo Luxury activo';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Ítems requeridos';end if;
 if p_metodo not in ('01','16','18','19','20') then raise exception 'Método inválido';end if;
 if p_periodicidad not in ('diaria','semanal','mensual') then raise exception 'Periodicidad inválida';end if;
 if p_periodicidad='mensual' and (p_dia_mes is null or p_dia_mes<1 or p_dia_mes>31) then raise exception 'Día de mes 1-31';end if;
 if p_periodicidad='semanal' and (p_dia_semana is null or p_dia_semana<0 or p_dia_semana>6) then raise exception 'Día semana 0-6';end if;
 if p_inicio < (now() at time zone 'America/Guayaquil')::date then raise exception 'Fecha inicio no pasada';end if;
 insert into public.facturas_programadas(tenant_id, cliente_id, items, metodo_pago, credito_dias, periodicidad, dia_mes, dia_semana, proxima_fecha, activa)
 values(t, p_cliente, p_items, p_metodo, p_credito, p_periodicidad,
 case when p_periodicidad='mensual' then p_dia_mes end,
 case when p_periodicidad='semanal' then p_dia_semana end,
 p_inicio, true)
 returning id into n;
 return n;
end$$;

-- Motor: emite cada programada vencida con el núcleo (sin sesión), con el
-- primer ADMIN de la empresa como creador. Un fallo individual no detiene el
-- lote ni avanza la fecha de esa programada (se reintenta en la próxima corrida).
create or replace function public.procesar_facturas_programadas()
returns int language plpgsql security definer set search_path='' as $$
declare rec record; cnt int:=0; admin_id uuid;
begin
 for rec in select * from public.facturas_programadas where activa and proxima_fecha <= (now() at time zone 'America/Guayaquil')::date loop
  select p.id into admin_id from public.usuarios_perfiles p where p.tenant_id=rec.tenant_id and p.rol='ADMIN' order by p.id limit 1;
  if admin_id is null then continue; end if;
  begin
   perform private.crear_factura_core(rec.tenant_id, admin_id, rec.cliente_id, rec.items, gen_random_uuid(), rec.metodo_pago, rec.credito_dias, 'VENTA', null, null, 0);
  exception when others then
   continue;
  end;
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

-- Privilegios: el núcleo no es invocable desde el navegador.
revoke all on function private.crear_factura_core(uuid,uuid,uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric) from public,anon,authenticated;
grant execute on function private.crear_factura_core(uuid,uuid,uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric) to service_role;
revoke all on function private.tiene_funcion_para(uuid,text) from public,anon,authenticated;
grant execute on function private.tiene_funcion_para(uuid,text) to service_role;

-- Tablas creadas después de la migración 002 que quedaron sin privilegios de
-- tabla (en producción los cubrían los default privileges de Supabase; se
-- hacen explícitos). Las políticas RLS siguen decidiendo fila a fila.
grant select, insert, update, delete on public.facturas_programadas to authenticated;
grant select, insert, update, delete on public.plantillas_documento to authenticated;
