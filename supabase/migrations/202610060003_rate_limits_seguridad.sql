-- Seguridad (auditoría 2026-10-05): límite de uso reutilizable para las
-- edge functions, tope en las RPC públicas de proformas, enmascaro de PII
-- en el enlace público de cotización y minimización de columnas legibles
-- desde el navegador (LOPDP).
--
-- 1) Contador de intentos compartido. La tabla queda sin policies y sin
--    privilegios para anon/authenticated: sólo el service_role (bypass RLS)
--    y el propietario pueden usarla. Cada llave es "<servicio>:<tenant|ip>".
create table public.edge_rate_limits (
  clave text not null,
  creado_en timestamptz not null default now()
);
create index edge_rate_limits_clave_creado_en_idx
  on public.edge_rate_limits (clave, creado_en);
alter table public.edge_rate_limits enable row level security;
revoke all on public.edge_rate_limits from public, anon, authenticated;
grant select, insert, delete on public.edge_rate_limits to service_role;

-- Registra el intento (primero) y devuelve true si aún está dentro del
-- límite en la ventana deslizante. De paso purga lo mayor de 72 h.
create or replace function public.registrar_intento_edge(
  p_clave text, p_limite integer, p_ventana_min integer default 60
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
  v_total integer;
begin
  if p_clave is null or p_clave !~* '^[a-z0-9:_-]{1,80}$'
     or p_limite < 1 or p_limite > 10000 then
    return false;
  end if;
  delete from public.edge_rate_limits where creado_en < now() - interval '72 hours';
  insert into public.edge_rate_limits (clave) values (p_clave);
  select count(*) into v_total
    from public.edge_rate_limits
   where clave = p_clave
     and creado_en >= now()
         - make_interval(mins => least(greatest(p_ventana_min, 1), 1440));
  return v_total <= p_limite;
end$$;
revoke all on function public.registrar_intento_edge(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_intento_edge(text, integer, integer)
  to service_role, postgres;

-- La purga del cron necesita borrar (sólo tenía select/insert).
grant delete on public.asistente_web_intentos,
                 public.p12_verify_intentos,
                 public.emision_intentos to service_role;

-- 2) Cotización pública: la cédula/RUC del cliente SÓLO se muestra enmascarada
--    (últimos 4 dígitos) y se limitan las consultas por token (60/15 min).
create or replace function public.ver_proforma(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.proformas; e public.empresas; c public.clientes;
begin
 if not public.registrar_intento_edge('proforma_ver:'||coalesce(p_token::text,'x'),60,15) then
  raise exception 'Demasiadas consultas de esta cotización; intenta en unos minutos';
 end if;
 select * into p from public.proformas where token_publico=p_token;
 if not found then return null;end if;
 select * into e from public.empresas where id=p.tenant_id;
 select * into c from public.clientes where tenant_id=p.tenant_id and id=p.cliente_id;
 return jsonb_build_object(
  'numero',p.numero,'estado',p.estado,'valida_hasta',p.valida_hasta,
  'creado_en',p.creado_en,'metodo_pago',p.metodo_pago,'credito_dias',p.credito_dias,
  'empresa',jsonb_build_object('nombre',e.nombre,'razon_social',e.razon_social,'ruc',e.ruc,'direccion',e.direccion),
  'cliente',jsonb_build_object('nombre',c.nombre,'identificacion',
    case when c.identificacion is null then null
         else '***'||right(c.identificacion,4) end),
  'items',p.items,
  'subtotal_0',p.subtotal_0,'subtotal_5',p.subtotal_5,'subtotal_15',p.subtotal_15,
  'descuentos',p.descuentos,'iva_5',p.iva_5,'iva_15',p.iva_15,'total',p.total);
end$$;

-- 3) Aprobación/rechazo públicos: 10 acciones cada 15 minutos por token.
--    Al ser SECURITY DEFINER, el límite vive en el servidor: el navegador
--    no puede saltárselo (PostgREST no pasa por el guard de edge functions).
create or replace function public.aprobar_proforma(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.proformas; fid uuid; items_core jsonb;
begin
 if not public.registrar_intento_edge('proforma_acc:'||coalesce(p_token::text,'x'),10,15) then
  raise exception 'Demasiadas consultas para esta cotización; intenta en unos minutos';
 end if;
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

create or replace function public.rechazar_proforma(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.registrar_intento_edge('proforma_acc:'||coalesce(p_token::text,'x'),10,15) then
  raise exception 'Demasiadas consultas para esta cotización; intenta en unos minutos';
 end if;
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

-- 4) Minimización de datos (LOPDP): el navegador sólo necesita la lista
--    mínima de miembros; email y teléfono de OTROS usuarios no son legibles
--    desde el cliente (sólo se exponen del propio registro vía RPCs).
--    La IP y el resto de la auditoría tampoco se exponen: la UI no la lee.
revoke select on public.usuarios_perfiles from anon, authenticated;
grant select (id, tenant_id, nombre, rol) on public.usuarios_perfiles to authenticated;
revoke select on public.auditoria from authenticated;
grant select (tenant_id, actor_id, accion, entidad, entidad_id, detalle, creado_en)
  on public.auditoria to authenticated;
