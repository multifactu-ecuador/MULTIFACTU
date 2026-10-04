-- Stock real en alquiler: validar stock vs reservas activas al crear contrato
-- Reemplaza la validación simple de estado por una que cuente reservas activas vs stock

create or replace function public.crear_factura(
  p_cliente uuid,
  p_items jsonb,
  p_token text,
  p_metodo text,
  p_credito_dias int,
  p_tipo text,
  p_salida timestamptz default null,
  p_retorno timestamptz default null,
  p_garantia numeric default 0
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  t uuid:=(select private.tenant_id());
  f uuid:=gen_random_uuid();
  contrato uuid;
  numero bigint;
  item jsonb;
  producto public.catalogo_maquinaria%rowtype;
  cantidad numeric;
  descuento numeric;
  precio numeric;
  base numeric;
  impuesto numeric;
  detalle text;
  dias int;
  viejo public.facturas_sri%rowtype;
  solicitud jsonb:=jsonb_build_object('cliente',p_cliente,'items',p_items,'metodo',p_metodo,'credito',p_credito_dias,'tipo',p_tipo,'salida',p_salida,'retorno',p_retorno,'garantia',p_garantia);
  reservas_activas int;
begin
  if t is null or not private.tiene_funcion('facturacion') then raise exception 'PLAN_REQUIRED: acceso vencido';end if;
  if p_tipo not in('VENTA','ALQUILER') or p_metodo not in('01','16','18','19','20') or p_credito_dias not between 0 and 365 or p_garantia<0 then raise exception 'Datos inválidos';end if;
  if p_tipo='ALQUILER' and not private.tiene_funcion('alquiler') then raise exception 'PLAN_REQUIRED: alquiler requiere Pro';end if;
  if p_tipo='VENTA' and (p_garantia<>0 or p_salida is not null or p_retorno is not null) then raise exception 'Garantía/fechas sólo corresponden al alquiler';end if;

  perform pg_advisory_xact_lock(hashtextextended(t::text||':factura',0));
  select * into viejo from public.facturas_sri where tenant_id=t and token=p_token;
  if viejo is not null then raise exception 'Token duplicado';end if;

  insert into public.secuenciales_sri(tenant_id,ambiente,establecimiento,punto_emision,tipo,ultimo)
  values(t,(select ambiente_sri from public.empresas where id=t),(select establecimiento from public.empresas where id=t),(select punto_emision from public.empresas where id=t),'01',1)
  on conflict(tenant_id,ambiente,establecimiento,punto_emision,tipo) do update set ultimo=public.secuenciales_sri.ultimo+1 returning ultimo into numero;

  insert into public.facturas_sri(id,tenant_id,cliente_id,contrato_id,creado_por,token,ambiente_sri,establecimiento,punto_emision,secuencial,metodo_pago,credito_dias,emisor_snapshot,cliente_snapshot,solicitud)
  values(f,t,null,null,auth.uid(),p_token,(select ambiente_sri from public.empresas where id=t),(select establecimiento from public.empresas where id=t),(select punto_emision from public.empresas where id=t),numero,p_metodo,p_credito_dias,
    jsonb_build_object('ruc',coalesce((select ruc from public.empresas where id=t),'1790016919001'),'razon_social',(select razon_social from public.empresas where id=t),'direccion',(select direccion from public.empresas where id=t),'regimen',coalesce((select regimen from public.empresas where id=t),'general'),'obligado_contabilidad',(select obligado_contabilidad from public.empresas where id=t)),
    (select to_jsonb(c) from public.clientes c where c.tenant_id=t and c.id=p_cliente),
    solicitud);

  if p_tipo='ALQUILER' then
    dias := greatest(1, ceil(extract(epoch from (p_retorno - p_salida))/86400)::int);
    contrato:=gen_random_uuid();
    insert into public.contratos_alquiler(id,tenant_id,cliente_id,salida,retorno,garantia,estado,creado_por,modo)
    values(contrato,t,p_cliente,p_salida,p_retorno,p_garantia,'ACTIVO',auth.uid(),'FACTURA');
  end if;

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

      -- VALIDACIÓN STOCK REAL: contar reservas activas para este equipo en las fechas
      select count(*) into reservas_activas
      from public.contratos_detalles cd
      join public.contratos_alquiler ca on ca.id=cd.contrato_id and ca.tenant_id=cd.tenant_id
      where cd.tenant_id=t
        and cd.equipo_id=producto.id
        and ca.estado='ACTIVO'
        and ca.salida < p_retorno
        and ca.retorno > p_salida;

      if (producto.stock - reservas_activas) < cantidad then
        raise exception 'Stock insuficiente para las fechas seleccionadas. Disponibles: %s, solicitados: %s', (producto.stock - reservas_activas), cantidad;
      end if;

      if exists(select 1 from public.contratos_detalles cd join public.contratos_alquiler ca on ca.id=cd.contrato_id and ca.tenant_id=cd.tenant_id
       where cd.tenant_id=t and cd.equipo_id=producto.id and ca.estado='ACTIVO' and ca.salida<p_retorno and ca.retorno>p_salida) then
        raise exception 'Equipo reservado en esas fechas';
      end if;

      precio:=precio*dias;
      detalle:='Alquiler de '||producto.nombre||' · '||dias||' días ['||to_char(p_salida at time zone 'America/Guayaquil','DD/Mon HH24:MI')||' — '||to_char(p_retorno at time zone 'America/Guayaquil','DD/Mon HH24:MI')||']';
      insert into public.contratos_detalles(tenant_id,contrato_id,equipo_id,tarifa_dia) values(t,contrato,producto.id,producto.precio);
    elsif producto.tipo='PRODUCTO' then
      if producto.stock < cantidad then raise exception 'Stock insuficiente';end if;
      update public.catalogo_maquinaria set stock=stock-cantidad where id=producto.id and tenant_id=t;
    end if;

    base:=round(cantidad*precio,2)-descuento;
    if base<0 then raise exception 'Descuento superior al importe';end if;
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
  select t,f,p_cliente,(inv.fecha + p_credito_dias),inv.total
  from public.facturas_sri inv where inv.id=f and inv.total>0;

  return f;
end$$;