alter table public.facturas_sri add column solicitud jsonb not null default '{}'::jsonb;
-- Operación fiscal atómica: precios/tarifas provienen del catálogo, no del navegador.
-- La garantía existe únicamente en contrato/ledger, nunca se agrega a base ni IVA.
create function public.crear_factura(
 p_cliente uuid, p_items jsonb, p_token uuid, p_metodo text default '20', p_credito_dias int default 0,
 p_tipo text default 'VENTA', p_salida timestamptz default null, p_retorno timestamptz default null,
 p_garantia numeric default 0
) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=private.tenant_id(); e public.empresas; c public.clientes; producto public.catalogo_maquinaria;
 f uuid:=gen_random_uuid(); contrato uuid; numero bigint; item jsonb; cantidad numeric; precio numeric; base numeric; descuento numeric;
 impuesto numeric; detalle text; dias int; viejo public.facturas_sri;
 solicitud jsonb:=jsonb_build_object('cliente',p_cliente,'items',p_items,'metodo',p_metodo,'credito',p_credito_dias,'tipo',p_tipo,'salida',p_salida,'retorno',p_retorno,'garantia',p_garantia);
begin
 if t is null or not private.tiene_funcion('facturacion') then raise exception 'PLAN_REQUIRED: acceso vencido';end if;
 if p_tipo not in('VENTA','ALQUILER') or p_metodo not in('01','16','18','19','20') or p_credito_dias not between 0 and 365 or p_garantia<0 then raise exception 'Datos inválidos';end if;
 if p_credito_dias>0 and not private.tiene_funcion('finanzas') then raise exception 'PLAN_REQUIRED: crédito requiere Luxury';end if;
 if p_tipo='ALQUILER' and not private.tiene_funcion('alquiler') then raise exception 'PLAN_REQUIRED: alquiler requiere Pro';end if;
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
 insert into public.contratos_alquiler(id,tenant_id,cliente_id,salida,retorno,garantia,creado_por) values(contrato,t,c.id,p_salida,p_retorno,p_garantia,auth.uid());
 end if;
 insert into public.secuenciales_sri(tenant_id,ambiente,establecimiento,punto_emision,tipo,ultimo)
 values(t,e.ambiente_sri,e.establecimiento,e.punto_emision,'01',1)
 on conflict(tenant_id,ambiente,establecimiento,punto_emision,tipo) do update set ultimo=public.secuenciales_sri.ultimo+1 returning ultimo into numero;
 insert into public.facturas_sri(id,tenant_id,cliente_id,contrato_id,creado_por,token,ambiente_sri,establecimiento,punto_emision,secuencial,metodo_pago,credito_dias,emisor_snapshot,cliente_snapshot,solicitud)
 values(f,t,c.id,contrato,auth.uid(),p_token,e.ambiente_sri,e.establecimiento,e.punto_emision,numero,p_metodo,p_credito_dias,
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

create function private.caja_abierta(t uuid, fecha date) returns void language plpgsql set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended(t::text||':caja:'||fecha::text,0));
 if exists(select 1 from public.cierres_caja c where c.tenant_id=t and c.fecha=caja_abierta.fecha) then raise exception 'Caja cerrada para ese día';end if;
end$$;
create function public.registrar_abono(p_cuota uuid,p_monto numeric,p_metodo text,p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=private.tenant_id(); q public.cuotas; viejo public.movimientos_caja; mid uuid:=gen_random_uuid(); hoy date:=(now() at time zone 'America/Guayaquil')::date;begin
 if t is null or not private.tiene_funcion('finanzas') or private.rol()<>'ADMIN' then raise exception 'PLAN_REQUIRED: abonos requieren Luxury y administrador';end if;
 if p_monto<=0 or p_monto<>round(p_monto,2) or p_metodo not in('01','16','18','19','20') then raise exception 'Monto/medio inválidos';end if;
 perform private.caja_abierta(t,hoy);
 select * into viejo from public.movimientos_caja where tenant_id=t and token=p_token;
 if found then if viejo.cuota_id<>p_cuota or viejo.monto<>p_monto or viejo.metodo_pago<>p_metodo then raise exception 'Token incompatible';end if;return viejo.id;end if;
 select * into q from public.cuotas where tenant_id=t and id=p_cuota for update;
 if not found or p_monto>q.monto-q.pagado then raise exception 'Cuota inexistente o abono excedido';end if;
 update public.cuotas set pagado=pagado+p_monto where tenant_id=t and id=q.id;
 insert into public.movimientos_caja(id,tenant_id,tipo,monto,metodo_pago,categoria,descripcion,cuota_id,creado_por,token)
 values(mid,t,'INGRESO',p_monto,p_metodo,'Cobros','Abono de factura',q.id,auth.uid(),p_token);return mid;
end$$;
create function public.registrar_gasto(p_monto numeric,p_metodo text,p_categoria text,p_descripcion text,p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=private.tenant_id(); mid uuid:=gen_random_uuid(); viejo public.movimientos_caja; hoy date:=(now() at time zone 'America/Guayaquil')::date;begin
 if t is null or not private.tiene_funcion('finanzas') or private.rol()<>'ADMIN' then raise exception 'PLAN_REQUIRED: gastos requieren Luxury y administrador';end if;
 if p_monto<=0 or p_monto<>round(p_monto,2) or p_metodo not in('01','16','18','19','20') or length(trim(p_descripcion))<2 then raise exception 'Datos inválidos';end if;
 perform private.caja_abierta(t,hoy);
 select * into viejo from public.movimientos_caja where tenant_id=t and token=p_token;
 if found then if viejo.tipo<>'EGRESO' or viejo.monto<>p_monto or viejo.metodo_pago<>p_metodo or viejo.descripcion<>p_descripcion or viejo.categoria<>p_categoria then raise exception 'Token incompatible';end if;return viejo.id;end if;
 insert into public.movimientos_caja(id,tenant_id,tipo,monto,metodo_pago,categoria,descripcion,creado_por,token)
 values(mid,t,'EGRESO',p_monto,p_metodo,p_categoria,p_descripcion,auth.uid(),p_token);return mid;
end$$;
create function public.cerrar_caja(p_fecha date,p_fisico numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=private.tenant_id(); cid uuid:=gen_random_uuid(); sistema numeric; hoy date:=(now() at time zone 'America/Guayaquil')::date;begin
 if t is null or not private.tiene_funcion('finanzas') or private.rol()<>'ADMIN' then raise exception 'PLAN_REQUIRED: cierre requiere Luxury y administrador';end if;
 if p_fecha>hoy or p_fisico<0 or p_fisico<>round(p_fisico,2) then raise exception 'Fecha/conteo inválidos';end if;
 perform private.caja_abierta(t,p_fecha);
 select coalesce(sum(case when tipo in('INGRESO','GARANTIA') then monto else -monto end),0) into sistema
 from public.movimientos_caja where tenant_id=t and fecha=p_fecha and metodo_pago='01';
 insert into public.cierres_caja(id,tenant_id,fecha,efectivo_sistema,efectivo_fisico,retroactivo,creado_por)
 values(cid,t,p_fecha,sistema,p_fisico,p_fecha<hoy,auth.uid());return cid;
end$$;
-- El saldo inicial no se inventa; estos cierres corresponden a movimientos netos de una caja única por empresa.
-- Para varias cajas/turnos se añade caja_id y apertura y se adapta el mismo bloqueo transaccional.
revoke all on function public.crear_factura(uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric),public.registrar_abono(uuid,numeric,text,uuid),public.registrar_gasto(numeric,text,text,text,uuid),public.cerrar_caja(date,numeric) from public,anon;
grant execute on function public.crear_factura(uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric),public.registrar_abono(uuid,numeric,text,uuid),public.registrar_gasto(numeric,text,text,text,uuid),public.cerrar_caja(date,numeric) to authenticated;
revoke all on function private.caja_abierta(uuid,date) from public,anon,authenticated;
