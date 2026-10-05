-- Reglas de acceso:
-- 1) SUPERADMIN: la empresa del correo lopeznieto2512@gmail.com tiene todas
--    las funciones siempre, sin importar plan ni vencimiento. Es el único
--    bypass y queda registrado en esta función.
-- 2) LÍMITE DE PRUEBA: en estado 'trial' la empresa puede emitir hasta 10
--    facturas (intentos incluidos). Al llegar a 10 debe elegir un plan.
--    El conteo se hace dentro del núcleo, bajo el lock por empresa, así que
--    dos clics simultáneos no pueden pasar del límite.

create or replace function private.es_superadmin(p_tenant uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.usuarios_perfiles p
    join auth.users u on u.id = p.id
    where p.tenant_id = p_tenant
      and lower(u.email) = 'lopeznieto2512@gmail.com'
  )
$$;

-- tiene_funcion_para ahora concede todo al superadmin antes de mirar el plan.
create or replace function private.tiene_funcion_para(p_tenant uuid, funcion text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.es_superadmin(p_tenant) or coalesce((select s.estado in ('trial','active') and now()>=s.inicio and now()<s.fin and
  (funcion in ('facturacion','inventario','clientes','servicios','proformas') or
  (funcion='alquiler' and (s.estado='trial' or s.plan in('pro','luxury'))) or
  (funcion in ('finanzas','analisis','programada') and (s.estado='trial' or s.plan='luxury')))
  from public.suscripciones s where s.tenant_id=p_tenant),false)
$$;

-- Límite de 10 facturas en prueba, aplicado en el núcleo de emisión.
-- Va DESPUÉS de la comprobación de idempotencia: reintentos del mismo token
-- no consumen cupo.
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

-- mi_acceso expone si la empresa es superadmin (para que la UI no le muestre
-- candados) y cuántas facturas de prueba lleva (para el contador 10/10).
create or replace function public.mi_acceso() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tenant_id',p.tenant_id,'rol',p.rol,'nombre',p.nombre,'ahora',now(),
 'superadmin',private.es_superadmin(p.tenant_id),
 'facturas_prueba',(select count(*) from public.facturas_sri f where f.tenant_id=p.tenant_id),
 'suscripcion',to_jsonb(s),'empresa',to_jsonb(e),'funciones',jsonb_build_object(
 'facturacion',private.tiene_funcion('facturacion'),'inventario',private.tiene_funcion('inventario'),
 'clientes',private.tiene_funcion('clientes'),'proformas',private.tiene_funcion('proformas'),
 'alquiler',private.tiene_funcion('alquiler'),'finanzas',private.tiene_funcion('finanzas'),
 'analisis',private.tiene_funcion('analisis'),'programada',private.tiene_funcion('programada')))
 from public.usuarios_perfiles p join public.empresas e on e.id=p.tenant_id join public.suscripciones s on s.tenant_id=p.tenant_id
 where p.id=auth.uid()
$$;

revoke all on function private.es_superadmin(uuid) from public,anon,authenticated;
grant execute on function private.es_superadmin(uuid) to service_role;
