-- Proformas / cotizaciones con aprobación pública por link:
-- el vendedor crea la cotización; el cliente la ve y la aprueba desde su
-- teléfono con un enlace de token opaco; al aprobarse se genera la factura
-- automáticamente con el núcleo (stock, secuencial, cuotas y webhook SRI).
create table public.proformas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.empresas(id),
  numero bigint not null,
  cliente_id uuid not null,
  creado_por uuid not null,
  token_publico uuid not null default gen_random_uuid(),
  items jsonb not null, -- snapshot: [{id,nombre,cantidad,precio,descuento,iva,base,impuesto}]
  metodo_pago text not null default '20' check(metodo_pago in ('01','16','18','19','20')),
  credito_dias int not null default 0 check(credito_dias between 0 and 365),
  subtotal_0 numeric(14,2) not null default 0,
  subtotal_5 numeric(14,2) not null default 0,
  subtotal_15 numeric(14,2) not null default 0,
  descuentos numeric(14,2) not null default 0,
  iva_5 numeric(14,2) not null default 0,
  iva_15 numeric(14,2) not null default 0,
  total numeric(14,2) not null check(total>=0),
  estado text not null default 'Enviada' check(estado in ('Enviada','Aprobada','Rechazada','Anulada')),
  valida_hasta date not null,
  factura_id uuid,
  aprobada_en timestamptz,
  creado_en timestamptz not null default now(),
  unique(tenant_id,id), unique(tenant_id,numero), unique(token_publico),
  foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id),
  foreign key(tenant_id,creado_por) references public.usuarios_perfiles(tenant_id,id),
  foreign key(tenant_id,factura_id) references public.facturas_sri(tenant_id,id)
);
create index on public.proformas(tenant_id);
alter table public.proformas enable row level security;
-- Lectura para la empresa; la escritura es sólo por RPC.
create policy proforma_read on public.proformas for select to authenticated
 using(tenant_id=(select private.tenant_id()) and private.tiene_funcion('proformas'));
grant select on public.proformas to authenticated;

-- Crear cotización: precios y totales salen del catálogo, nunca del navegador.
create or replace function public.crear_proforma(
 p_cliente uuid, p_items jsonb, p_metodo text default '20', p_credito_dias int default 0, p_validez_dias int default 15
) returns jsonb language plpgsql security definer set search_path='' as $$
declare t uuid:=private.tenant_id(); producto public.catalogo_maquinaria; item jsonb;
 cantidad numeric; precio numeric; base numeric; descuento numeric; impuesto numeric;
 numero bigint; pid uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid();
 snapshot jsonb:='[]'::jsonb;
 s0 numeric:=0; s5 numeric:=0; s15 numeric:=0; i5 numeric:=0; i15 numeric:=0; dsct numeric:=0;
begin
 if t is null or not private.tiene_funcion('proformas') then raise exception 'PLAN_REQUIRED: acceso vencido';end if;
 if p_metodo not in('01','16','18','19','20') or p_credito_dias not between 0 and 365 or p_validez_dias not between 1 and 90 then raise exception 'Datos inválidos';end if;
 if p_credito_dias>0 and not private.tiene_funcion('finanzas') then raise exception 'PLAN_REQUIRED: crédito requiere Luxury';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 ítems';end if;
 if not exists(select 1 from public.clientes c where c.tenant_id=t and c.id=p_cliente) then raise exception 'Cliente inexistente en tu empresa';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':proforma',0));
 select coalesce(max(p.numero),0)+1 into numero from public.proformas p where p.tenant_id=t;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into producto from public.catalogo_maquinaria where tenant_id=t and id=(item->>'id')::uuid;
  if not found then raise exception 'Ítem fuera de tu empresa';end if;
  cantidad:=(item->>'cantidad')::numeric;
  descuento:=coalesce((item->>'descuento')::numeric,0);
  if cantidad is null or cantidad<=0 or cantidad>100000 or cantidad<>round(cantidad,3) or descuento<0 or descuento<>round(descuento,2) then raise exception 'Cantidad/descuento inválidos';end if;
  precio:=producto.precio;
  base:=round(cantidad*precio,2)-descuento; if base<0 then raise exception 'Descuento superior al importe';end if;
  impuesto:=round(base*producto.iva/100,2);
  snapshot:=snapshot||jsonb_build_object('id',producto.id,'nombre',producto.nombre,'cantidad',cantidad,'precio',precio,'descuento',descuento,'iva',producto.iva,'base',base,'impuesto',impuesto);
  dsct:=dsct+descuento;
  if producto.iva=0 then s0:=s0+base;
  elsif producto.iva=5 then s5:=s5+base; i5:=i5+impuesto;
  else s15:=s15+base; i15:=i15+impuesto; end if;
 end loop;
 insert into public.proformas(id,tenant_id,numero,cliente_id,creado_por,token_publico,items,metodo_pago,credito_dias,
  subtotal_0,subtotal_5,subtotal_15,descuentos,iva_5,iva_15,total,valida_hasta)
 values(pid,t,numero,p_cliente,auth.uid(),tok,snapshot,p_metodo,p_credito_dias,
  s0,s5,s15,dsct,i5,i15,s0+s5+s15+i5+i15,(now() at time zone 'America/Guayaquil')::date+p_validez_dias);
 return jsonb_build_object('id',pid,'numero',numero,'token',tok);
end$$;

-- Vista pública de la cotización (sin login): sólo datos necesarios para
-- revisarla, identificada por su token opaco.
create or replace function public.ver_proforma(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.proformas; e public.empresas; c public.clientes;
begin
 select * into p from public.proformas where token_publico=p_token;
 if not found then return null;end if;
 select * into e from public.empresas where id=p.tenant_id;
 select * into c from public.clientes where tenant_id=p.tenant_id and id=p.cliente_id;
 return jsonb_build_object(
  'numero',p.numero,'estado',p.estado,'valida_hasta',p.valida_hasta,
  'creado_en',p.creado_en,'metodo_pago',p.metodo_pago,'credito_dias',p.credito_dias,
  'empresa',jsonb_build_object('nombre',e.nombre,'razon_social',e.razon_social,'ruc',e.ruc,'direccion',e.direccion),
  'cliente',jsonb_build_object('nombre',c.nombre,'identificacion',c.identificacion),
  'items',p.items,
  'subtotal_0',p.subtotal_0,'subtotal_5',p.subtotal_5,'subtotal_15',p.subtotal_15,
  'descuentos',p.descuentos,'iva_5',p.iva_5,'iva_15',p.iva_15,'total',p.total);
end$$;

-- Aprobación pública: genera la factura con el núcleo (misma validación,
-- stock, secuencial y webhook que una venta en caja). Idempotente: repetir la
-- aprobación devuelve la misma factura sin duplicar.
create or replace function public.aprobar_proforma(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.proformas; fid uuid; items_core jsonb;
begin
 select * into p from public.proformas where token_publico=p_token;
 if not found then raise exception 'Cotización no encontrada';end if;
 if p.estado='Aprobada' then return jsonb_build_object('estado','Aprobada','factura',p.factura_id);end if;
 if p.estado<>'Enviada' then raise exception 'Esta cotización ya no está disponible (estado: %)',p.estado;end if;
 if p.valida_hasta<(now() at time zone 'America/Guayaquil')::date then raise exception 'Esta cotización expiró el %',p.valida_hasta;end if;
 select jsonb_agg(jsonb_build_object('id',x->>'id','cantidad',(x->>'cantidad')::numeric,'descuento',(x->>'descuento')::numeric))
 into items_core from jsonb_array_elements(p.items) x;
 fid:=private.crear_factura_core(p.tenant_id,p.creado_por,p.cliente_id,items_core,gen_random_uuid(),p.metodo_pago,p.credito_dias,'VENTA',null,null,0);
 update public.proformas set estado='Aprobada',factura_id=fid,aprobada_en=now() where id=p.id;
 return jsonb_build_object('estado','Aprobada','factura',fid);
end$$;

-- Rechazo público: deja constancia sin generar nada.
create or replace function public.rechazar_proforma(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.proformas set estado='Rechazada'
 where token_publico=p_token and estado='Enviada';
 if not found then
   if exists(select 1 from public.proformas where token_publico=p_token) then
     raise exception 'Esta cotización ya no está disponible';
   end if;
   raise exception 'Cotización no encontrada';
 end if;
 return jsonb_build_object('estado','Rechazada');
end$$;

-- Anular desde la app (ADMIN), sólo si nadie la ha respondido.
create or replace function public.anular_proforma(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if private.tenant_id() is null or private.rol()<>'ADMIN' then raise exception 'Requiere administrador';end if;
 update public.proformas set estado='Anulada'
 where id=p_id and tenant_id=private.tenant_id() and estado='Enviada';
 if not found then raise exception 'Sólo se pueden anular cotizaciones enviadas';end if;
end$$;

revoke all on function public.crear_proforma(uuid,jsonb,text,int,int) from public,anon;
grant execute on function public.crear_proforma(uuid,jsonb,text,int,int) to authenticated;
revoke all on function public.anular_proforma(uuid) from public,anon;
grant execute on function public.anular_proforma(uuid) to authenticated;
revoke all on function public.ver_proforma(uuid),public.aprobar_proforma(uuid),public.rechazar_proforma(uuid) from public;
grant execute on function public.ver_proforma(uuid),public.aprobar_proforma(uuid),public.rechazar_proforma(uuid) to anon,authenticated;
