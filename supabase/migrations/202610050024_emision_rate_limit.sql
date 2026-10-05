-- Límite de emisiones: máximo 30 facturas por hora por empresa (anti spam /
-- anti DDoS al flujo de facturación). Se aplica en el núcleo de emisión, así
-- que cubre venta, alquiler, programadas y cualquier camino futuro. El
-- superadmin no tiene límite. Los reintentos con el mismo token idempotente
-- no consumen cupo (el chequeo va después de la comprobación de idempotencia).
create table public.emision_intentos(
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.empresas(id) on delete cascade,
  creado_en timestamptz not null default now()
);
create index on public.emision_intentos(tenant_id, creado_en);
alter table public.emision_intentos enable row level security;
revoke all on public.emision_intentos from anon, authenticated;
grant select, insert on public.emision_intentos to service_role;

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
 -- LÍMITE DE EMISIÓN: 30 facturas por hora (el superadmin no tiene límite).
 if not private.es_superadmin(t)
    and (select count(*) from public.emision_intentos i where i.tenant_id=t and i.creado_en > now() - interval '1 hour') >= 30 then
   raise exception 'RATE_LIMIT: máximo 30 facturas por hora. Contacta a soporte si es un error.';
 end if;
 insert into public.emision_intentos(tenant_id) values(t);
 -- LÍMITE DE PRUEBA: 10 facturas en trial (el superadmin no tiene límite).
 if not private.es_superadmin(t)
    and (select s.estado from public.suscripciones s where s.tenant_id=t)='trial'
    and (select count(*) from public.facturas_sri f where f.tenant_id=t)>=10 then
   raise exception 'TRIAL_LIMIT: usaste las 10 facturas de prueba. Elige un plan para seguir emitiendo.';
 end if;
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
