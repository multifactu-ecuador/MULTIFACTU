-- FASE 2 · Identidad en texto para la migración de autenticación a Clerk.
-- Solo añade este archivo (append-only): ninguna migración previa se modifica.
--
-- Contexto: el JWT de Clerk llega a Postgres con el claim `sub` = id de Clerk
-- (texto, p.ej. `user_2abc...`), no un uuid. En esta fase:
--   1) private.uid() (nuevo, de postgres) devuelve text con los mismos
--      claims que leía auth.uid(); auth.uid() se deja intacta porque es de
--      supabase_auth_admin y no es modificable desde aquí (42501).
--   2) Se elimina el trigger sobre auth.users: el alta de negocio la hace el
--      frontend con public.crear_mi_empresa tras registrarse en Clerk.
--   3) Se eliminan las FK a auth.users (3 sitios).
--   4) Las columnas de identidad pasan de uuid a text (constraints rehechos).
--   5) private.es_superadmin lee public.usuarios_perfiles.email (sin auth.users).
--   6) usuarios_perfiles.email + backfill + crear_mi_empresa con 7º parámetro.
-- La tabla auth.users (Supabase) NO se toca: ni su tipo ni su contenido.
-- Todo va en una única transacción para que sea atómico.

begin;

-- Garantiza que el deparse de expressions (pg_policies.qual) escriba
-- auth.uid() esquema-calificado al reconstruir las policies del paso 1.
set search_path = public, pg_temp;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Policies dependientes de auth.uid() y nueva función private.uid().
--    auth.uid() NO se puede tocar: su dueña es supabase_auth_admin y desde
--    postgres da 42501 ("must be owner of function auth.uid()"), ni siquiera
--    con supabase_privileged_role. En su lugar se crea private.uid(): misma
--    lectura de claims (request.jwt.claim.sub y, en su defecto,
--    request.jwt.claims->sub) pero devuelve text sin cast a uuid, que es lo
--    que trae el sub de Clerk (user_...). Las policies que comparan con
--    auth.uid() (5: perfil_nombre, consentimiento_lectura_propia y las 3 de
--    avatares en storage) se guardan aquí, se dropean y se recrean en el
--    paso 4b con la sustitución auth.uid() -> private.uid(), recién cuando
--    las columnas de identidad ya sean text (con id uuid y private.uid()
--    text daría "operator does not exist: uuid = text" al analizarlas).
-- ───────────────────────────────────────────────────────────────────────────
create temporary table _clerk_policies_auth_uid(
 ord int primary key, esquema text, tabla text, nombre text, ddl text
);

do $do$
declare pol record; ddl text; n int := 0;
begin
 for pol in
  select ns.nspname esquema, cls.relname tabla, p.polname nombre,
         q.permissive, q.cmd, q.roles, q.qual, q.with_check
  from pg_policy p
  join pg_class cls on cls.oid = p.polrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  join pg_policies q on q.schemaname = ns.nspname and q.tablename = cls.relname
                    and q.policyname = p.polname
  where exists (
    select 1 from pg_depend d
    where d.classid = 'pg_policy'::regclass and d.objid = p.oid
      and d.refclassid = 'pg_proc'::regclass
      and d.refobjid = 'auth.uid()'::regprocedure
      and d.deptype = 'n')
  order by ns.nspname, cls.relname, p.polname
 loop
  ddl := format('create policy %I on %I.%I as %s for %s to %s',
                pol.nombre, pol.esquema, pol.tabla, pol.permissive, pol.cmd,
                array_to_string(pol.roles, ', '));
  if pol.qual is not null then
   ddl := ddl || format(' using(%s)', pol.qual);
  end if;
  if pol.with_check is not null then
   ddl := ddl || format(' with check(%s)', pol.with_check);
  end if;
  n := n + 1;
  insert into _clerk_policies_auth_uid values (n, pol.esquema, pol.tabla, pol.nombre, ddl);
 end loop;
 -- Se dropean en un segundo paso: sin tocar los catálogos durante la captura.
 for pol in select esquema, tabla, nombre from _clerk_policies_auth_uid order by ord loop
  execute format('drop policy %I on %I.%I', pol.nombre, pol.esquema, pol.tabla);
 end loop;
end $do$;

-- auth.uid() NO puede recrearse: la función pertenece a supabase_auth_admin
-- y postgres no es su dueño (error 42501 "must be owner of function
-- auth.uid()" ni siquiera con supabase_privileged_role: "permission denied
-- for schema auth"). Se mantiene intacta —sigue sirviendo a las sesiones
-- legacy de Supabase Auth— y toda la lógica de identidad pasa a
-- private.uid(): mismo lector de claims, pero devuelve text, que es lo que
-- trae el sub de Clerk (user_...), sin cast a uuid.
-- auth.uid() NO puede recrearse: la función pertenece a supabase_auth_admin
-- y postgres no es su dueño (error 42501 "must be owner of function
-- auth.uid()" ni siquiera con supabase_privileged_role: "permission denied
-- for schema auth"). Se mantiene intacta —sigue sirviendo a las sesiones
-- legacy de Supabase Auth— y toda la lógica de identidad pasa a
-- private.uid(): mismo lector de claims, pero devuelve text, que es lo que
-- trae el sub de Clerk (user_...), sin cast a uuid.
create function private.uid() returns text
language sql stable
as $$
 select nullif(
   coalesce(
     nullif(current_setting('request.jwt.claim.sub', true), ''),
     nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
   ),
   '')
$$;
grant execute on function private.uid() to anon, authenticated, service_role;

-- (La recreación de las policies queda para después del paso 4: sus
--  expresiones comparan con columnas de identidad que aún son uuid.)

-- ───────────────────────────────────────────────────────────────────────────
-- 2) El trigger sobre auth.users desaparece (la alta la hace el frontend con
--    crear_mi_empresa tras el registro en Clerk). Si por permisos no se puede
--    dropear, la función queda neutralizada (no-op): nadie crea negocio desde
--    auth.users, que es exactamente el comportamiento deseado.
-- ───────────────────────────────────────────────────────────────────────────
do $do$
begin
 begin
  drop trigger if exists multifactu_auth_user_created on auth.users;
  drop function if exists private.crear_negocio_al_registrarse();
 exception when others then
  create or replace function private.crear_negocio_al_registrarse() returns trigger
  language plpgsql security definer set search_path='' as $fn$
  begin
   return new;
  end $fn$;
 end;
end $do$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Constraints dependientes de las columnas que van a cambiar de tipo.
--    Se dropean dinámicamente y en este orden:
--      (a) las FK de tablas public que referencian auth.users (3 sitios). Las
--          del propio esquema auth (identities -> users) se dejan intactas:
--          no cambiamos nada ahí y postgres no es dueño de esas tablas (42501);
--      (b) todas las FK sobre columnas de identidad (las 6 compuestas a
--          usuarios_perfiles se recrean igual que estaban en el paso 6);
--      (c) el resto de constraints (pkey/unique) que contengan esas columnas.
-- ───────────────────────────────────────────────────────────────────────────
do $do$
declare r record;
begin
 -- (a) FK a auth.users sobre tablas public:
 --     usuarios_perfiles.id, consentimientos_legales.usuario_id,
 --     emisor_firmas.uploaded_by
 --     (excluye auth.*: p.ej. auth.identities -> auth.users, que es
 --     interna de Supabase Auth y está fuera de nuestro alcance 42501)
 for r in
  select ns.nspname esquema, cls.relname tabla, con.conname nombre
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  where con.contype = 'f' and con.confrelid = 'auth.users'::regclass
    and ns.nspname <> 'auth'
 loop
  execute format('alter table %I.%I drop constraint %I',
                 r.esquema, r.tabla, r.nombre);
 end loop;

 -- (b) FK sobre columnas de identidad (a recrear en el paso 6)
 for r in
  with destinos(sch, tbl, col) as (values
    ('public', 'usuarios_perfiles', 'id'),
    ('public', 'consentimientos_legales', 'usuario_id'),
    ('public', 'emisor_firmas', 'uploaded_by'),
    ('public', 'contratos_alquiler', 'creado_por'),
    ('public', 'facturas_sri', 'creado_por'),
    ('public', 'movimientos_caja', 'creado_por'),
    ('public', 'cierres_caja', 'creado_por'),
    ('public', 'pedidos_planes', 'usuario_id'),
    ('public', 'proformas', 'creado_por'),
    ('public', 'auditoria', 'actor_id'))
  select distinct ns.nspname esquema, cls.relname tabla, con.conname nombre
  from destinos d
  join pg_class cls on cls.relname = d.tbl
  join pg_namespace ns on ns.oid = cls.relnamespace and ns.nspname = d.sch
  join pg_attribute a on a.attrelid = cls.oid and a.attname = d.col
                     and not a.attisdropped
  join pg_constraint con on con.conrelid = cls.oid and a.attnum = any (con.conkey)
  where con.contype = 'f'
 loop
  execute format('alter table %I.%I drop constraint %I',
                 r.esquema, r.tabla, r.nombre);
 end loop;

 -- (c) pkey/unique sobre columnas de identidad (usuarios_perfiles.id,
 --     usuarios_perfiles(tenant_id,id), consentimientos_legales(usuario_id,...))
 for r in
  with destinos(sch, tbl, col) as (values
    ('public', 'usuarios_perfiles', 'id'),
    ('public', 'consentimientos_legales', 'usuario_id'),
    ('public', 'emisor_firmas', 'uploaded_by'),
    ('public', 'contratos_alquiler', 'creado_por'),
    ('public', 'facturas_sri', 'creado_por'),
    ('public', 'movimientos_caja', 'creado_por'),
    ('public', 'cierres_caja', 'creado_por'),
    ('public', 'pedidos_planes', 'usuario_id'),
    ('public', 'proformas', 'creado_por'),
    ('public', 'auditoria', 'actor_id'))
  select distinct ns.nspname esquema, cls.relname tabla, con.conname nombre
  from destinos d
  join pg_class cls on cls.relname = d.tbl
  join pg_namespace ns on ns.oid = cls.relnamespace and ns.nspname = d.sch
  join pg_attribute a on a.attrelid = cls.oid and a.attname = d.col
                     and not a.attisdropped
  join pg_constraint con on con.conrelid = cls.oid and a.attnum = any (con.conkey)
  where con.contype in ('p', 'u')
 loop
  execute format('alter table %I.%I drop constraint %I',
                 r.esquema, r.tabla, r.nombre);
 end loop;
end $do$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Columnas de identidad uuid → text (lista explícita y comentada).
--    Ninguna de ellas conserva constraints: se reconstruyen en el paso 6.
--    auditoria.actor_id es la única sin FK/unique, pero los triggers de
--    auditoría guardan nullif(auth.uid(), ...) que ya es text.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.usuarios_perfiles       alter column id          type text; -- antes: uuid PK + FK a auth.users
alter table public.consentimientos_legales alter column usuario_id  type text; -- antes: uuid FK a auth.users
alter table public.emisor_firmas           alter column uploaded_by type text; -- antes: uuid FK a auth.users
alter table public.contratos_alquiler      alter column creado_por  type text;
alter table public.facturas_sri            alter column creado_por  type text;
alter table public.movimientos_caja        alter column creado_por  type text;
alter table public.cierres_caja            alter column creado_por  type text;
alter table public.pedidos_planes          alter column usuario_id  type text;
alter table public.proformas               alter column creado_por  type text;
alter table public.auditoria               alter column actor_id    type text;

-- ───────────────────────────────────────────────────────────────────────────
-- 4b) Recreación de las policies dropeadas en el paso 1, ya con las columnas
--     de identidad en text (si se hicieran antes, `id = auth.uid()` daría
--     "operator does not exist: uuid = text" al analizarlas).
--     El DDL se deparseó con search_path = public, pg_temp (cabecera), así
--     que auth.uid() sale esquema-calificado.
-- ───────────────────────────────────────────────────────────────────────────
do $do$
declare r record;
begin
 for r in select ddl from _clerk_policies_auth_uid order by ord loop
  execute replace(r.ddl, 'auth.uid()', 'private.uid()');
 end loop;
 drop table _clerk_policies_auth_uid;
end $do$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Correo del usuario en el perfil: fuente de verdad que ya no depende de
--    auth.users (lo usa private.es_superadmin y el onboarding).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.usuarios_perfiles add column if not exists email text;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) Reconstrucción de los constraints con las mismas definiciones que antes
--    (paso 3b/3c): pkey de usuarios_perfiles, unique compuestas y las 6 FK
--    compuestas a usuarios_perfiles(tenant_id, id). Las FK a auth.users NO se
--    recrean: esa es la decisión de esta fase.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.usuarios_perfiles
  add constraint usuarios_perfiles_pkey primary key (id);
alter table public.usuarios_perfiles
  add constraint usuarios_perfiles_tenant_id_id_key unique (tenant_id, id);
alter table public.consentimientos_legales
  add constraint consentimientos_legales_usuario_id_version_terminos_version_key
  unique (usuario_id, version_terminos, version_privacidad, version_encargo);

alter table public.contratos_alquiler
  add constraint contratos_alquiler_tenant_id_creado_por_fkey
  foreign key (tenant_id, creado_por) references public.usuarios_perfiles (tenant_id, id);
alter table public.facturas_sri
  add constraint facturas_sri_tenant_id_creado_por_fkey
  foreign key (tenant_id, creado_por) references public.usuarios_perfiles (tenant_id, id);
alter table public.movimientos_caja
  add constraint movimientos_caja_tenant_id_creado_por_fkey
  foreign key (tenant_id, creado_por) references public.usuarios_perfiles (tenant_id, id);
alter table public.cierres_caja
  add constraint cierres_caja_tenant_id_creado_por_fkey
  foreign key (tenant_id, creado_por) references public.usuarios_perfiles (tenant_id, id);
alter table public.pedidos_planes
  add constraint pedidos_planes_tenant_id_usuario_id_fkey
  foreign key (tenant_id, usuario_id) references public.usuarios_perfiles (tenant_id, id);
alter table public.proformas
  add constraint proformas_tenant_id_creado_por_fkey
  foreign key (tenant_id, creado_por) references public.usuarios_perfiles (tenant_id, id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Backfill del email mientras auth.users siga existiendo: los perfiles
--    creados antes de Clerk toman su correo de Supabase Auth.
-- ───────────────────────────────────────────────────────────────────────────
update public.usuarios_perfiles p
set email = u.email
from auth.users u
where u.id::text = p.id and p.email is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 8) private.registrar_consentimiento_legal: el usuario ya es text.
--    (create or replace no admite cambiar el tipo de un parámetro → se dropea
--    la firma vieja y se crea la nueva con los mismos privilegios.)
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists private.registrar_consentimiento_legal(uuid, uuid, text);

create function private.registrar_consentimiento_legal(
 p_usuario_id text,
 p_tenant_id uuid,
 p_canal text
) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.consentimientos_legales(
  usuario_id,tenant_id,version_terminos,version_privacidad,version_encargo,canal
 ) values(
  p_usuario_id,p_tenant_id,'2026-10-04','2026-10-04','2026-10-04',p_canal
 ) on conflict(usuario_id,version_terminos,version_privacidad,version_encargo) do nothing;
end$$;
revoke all on function private.registrar_consentimiento_legal(text,uuid,text) from public,anon,authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) private.crear_factura_core: p_creado_por pasa a text (el llamador es
--    auth.uid() o el ADMIN de cada empresa). Se recrea el cuerpo vigente de la
--    última versión (202610050024_emision_rate_limit) y se re-aplican los
--    privilegios. procesar_facturas_programadas se recrea con admin_id text.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists private.crear_factura_core(uuid,uuid,uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric);

create function private.crear_factura_core(
 p_tenant uuid, p_creado_por text,
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
revoke all on function private.crear_factura_core(uuid,text,uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric) from public,anon,authenticated;
grant execute on function private.crear_factura_core(uuid,text,uuid,jsonb,uuid,text,int,text,timestamptz,timestamptz,numeric) to service_role;

-- El motor de facturación programada usa el primer ADMIN como creador; con
-- Clerk ese id ya es text.
create or replace function public.procesar_facturas_programadas()
returns int language plpgsql security definer set search_path='' as $$
declare rec record; cnt int:=0; admin_id text;
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

-- ───────────────────────────────────────────────────────────────────────────
-- 10) public.crear_mi_empresa con 7º parámetro p_email (default null).
--     Se dropea la firma de 6 argumentos y se crea la de 7: las llamadas
--     existentes con 6 args siguen resolviendo por el default. Cuerpo: el de
--     la última versión vigente (202610040014_consentimientos_legales) más el
--     email en el perfil. La versión de 4 argumentos queda revocada desde 0014.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.crear_mi_empresa(text,text,text,boolean,text,text);

create function public.crear_mi_empresa(
 p_empresa text,
 p_identificacion text,
 p_nombre text,
 p_consentimiento boolean,
 p_version_terminos text,
 p_version_privacidad text,
 p_email text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); v_emp text:=trim(coalesce(p_empresa,'')); v_id text:=trim(coalesce(p_identificacion,''));
 v_nombre text:=trim(coalesce(p_nombre,''));begin
 if exists(select 1 from public.usuarios_perfiles where id=private.uid()) then raise exception 'Ya tienes una empresa creada';end if;
 if v_emp='' or length(v_emp) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
 if v_id !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC inválido';end if;
 if length(v_id)=10 and not private.validar_cedula(v_id) then raise exception 'Cédula inválida';end if;
 if p_consentimiento is distinct from true
   or p_version_terminos<>'2026-10-04'
   or p_version_privacidad<>'2026-10-04'
 then raise exception 'Debes aceptar los Términos y la Política de privacidad vigentes';end if;
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,v_emp,v_id,v_emp,case when length(v_id)=13 then v_id else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre,email)
 values(private.uid(),t,'ADMIN',coalesce(nullif(v_nombre,''),v_emp),nullif(btrim(coalesce(p_email,'')),''));
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 perform private.registrar_consentimiento_legal(private.uid(),t,'onboarding_oauth');
 return t;
end$$;
revoke all on function public.crear_mi_empresa(text,text,text,boolean,text,text,text) from public,anon;
grant execute on function public.crear_mi_empresa(text,text,text,boolean,text,text,text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 11) private.es_superadmin sin join a auth.users: el superadmin es el
--     perfil con ese correo en public.usuarios_perfiles (backfill del paso 7).
--     create or replace conserva los privilegios existentes.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function private.es_superadmin(p_tenant uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.usuarios_perfiles p
    where p.tenant_id = p_tenant
      and lower(p.email) = 'lopeznieto2512@gmail.com'
  )
$$;



-- ============================================================================
-- 12) Funciones que llamaban auth.uid() -> private.uid().
--     auth.uid() es de supabase_auth_admin y no puede dropearse desde
--     postgres (42501), asi que queda intacta (sigue sirviendo a las
--     sesiones legacy de Supabase Auth) y toda la identidad pasa a
--     private.uid(), que devuelve text sin cast a uuid. Cuerpos copiados
--     literalmente de los vigentes con esa unica sustitucion. Van al
--     final: columnas de identidad ya en text y firmas de los pasos 8-10
--     aplicadas (crear_factura_core recibe text, registrar_consentimiento_
--     legal recibe text). Se recrean con create or replace: firma igual,
--     privilegios y triggers de auditoria se conservan.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.auditar_empresas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(private.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_empresas',
    'empresas',
    coalesce(new.id, old.id),
    jsonb_build_object('ruc', new.ruc),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$function$;

CREATE OR REPLACE FUNCTION private.auditar_facturas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(private.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_facturas_sri',
    'facturas_sri',
    coalesce(new.id, old.id),
    jsonb_build_object('estado', new.estado, 'total', new.total, 'simulacion', new.simulacion),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$function$;

CREATE OR REPLACE FUNCTION private.auditar_proformas()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(private.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_proformas',
    'proformas',
    coalesce(new.id, old.id),
    jsonb_build_object('estado', new.estado, 'numero', new.numero, 'total', new.total),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$function$;

CREATE OR REPLACE FUNCTION private.auditar_suscripciones()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.auditoria(tenant_id, actor_id, accion, entidad, entidad_id, detalle, ip)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    nullif(private.uid(), '00000000-0000-0000-0000-000000000000'),
    upper(tg_op) || '_suscripciones',
    'suscripciones',
    coalesce(new.id, old.id),
    jsonb_build_object('plan', new.plan, 'estado', new.estado),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end$function$;

CREATE OR REPLACE FUNCTION private.rol()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.rol from public.usuarios_perfiles p where p.id=private.uid()
$function$;

CREATE OR REPLACE FUNCTION private.tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p.tenant_id from public.usuarios_perfiles p where p.id=private.uid()
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_caja(p_fecha date, p_fisico numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=private.tenant_id(); cid uuid:=gen_random_uuid(); sistema numeric; hoy date:=(now() at time zone 'America/Guayaquil')::date;begin
 if t is null or not private.tiene_funcion('finanzas') or private.rol()<>'ADMIN' then raise exception 'PLAN_REQUIRED: cierre requiere Luxury y administrador';end if;
 if p_fecha>hoy or p_fisico<0 or p_fisico<>round(p_fisico,2) then raise exception 'Fecha/conteo inv├ílidos';end if;
 perform private.caja_abierta(t,p_fecha);
 select coalesce(sum(case when tipo in('INGRESO','GARANTIA') then monto else -monto end),0) into sistema
 from public.movimientos_caja where tenant_id=t and fecha=p_fecha and metodo_pago='01';
 insert into public.cierres_caja(id,tenant_id,fecha,efectivo_sistema,efectivo_fisico,retroactivo,creado_por)
 values(cid,t,p_fecha,sistema,p_fisico,p_fecha<hoy,private.uid());return cid;
end$function$;

CREATE OR REPLACE FUNCTION public.crear_factura(p_cliente uuid, p_items jsonb, p_token uuid, p_metodo text DEFAULT '20'::text, p_credito_dias integer DEFAULT 0, p_tipo text DEFAULT 'VENTA'::text, p_salida timestamp with time zone DEFAULT NULL::timestamp with time zone, p_retorno timestamp with time zone DEFAULT NULL::timestamp with time zone, p_garantia numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return private.crear_factura_core(private.tenant_id(), private.uid(), p_cliente, p_items, p_token, p_metodo, p_credito_dias, p_tipo, p_salida, p_retorno, p_garantia);
end$function$;

CREATE OR REPLACE FUNCTION public.crear_mi_empresa(p_empresa text, p_identificacion text, p_nombre text, p_consentimiento boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=gen_random_uuid(); v_emp text:=trim(coalesce(p_empresa,'')); v_id text:=trim(coalesce(p_identificacion,''));
 v_nombre text:=trim(coalesce(p_nombre,''));begin
 if exists(select 1 from public.usuarios_perfiles where id=private.uid()) then raise exception 'Ya tienes una empresa creada';end if;
 if v_emp='' or length(v_emp) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
 if v_id !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'C├®dula o RUC inv├ílido';end if;
 if length(v_id)=10 and not private.validar_cedula(v_id) then raise exception 'C├®dula inv├ílida';end if;
 if p_consentimiento is distinct from true then raise exception 'Acepta t├®rminos y privacidad';end if;
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,v_emp,v_id,v_emp,case when length(v_id)=13 then v_id else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre) values(private.uid(),t,'ADMIN',coalesce(nullif(v_nombre,''),v_emp));
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 return t;
end$function$;

CREATE OR REPLACE FUNCTION public.crear_proforma(p_cliente uuid, p_items jsonb, p_metodo text DEFAULT '20'::text, p_credito_dias integer DEFAULT 0, p_validez_dias integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=private.tenant_id(); producto public.catalogo_maquinaria; item jsonb;
 cantidad numeric; precio numeric; base numeric; descuento numeric; impuesto numeric;
 numero bigint; pid uuid:=gen_random_uuid(); tok uuid:=gen_random_uuid();
 snapshot jsonb:='[]'::jsonb;
 s0 numeric:=0; s5 numeric:=0; s15 numeric:=0; i5 numeric:=0; i15 numeric:=0; dsct numeric:=0;
begin
 if t is null or not private.tiene_funcion('proformas') then raise exception 'PLAN_REQUIRED: acceso vencido';end if;
 if p_metodo not in('01','16','18','19','20') or p_credito_dias not between 0 and 365 or p_validez_dias not between 1 and 90 then raise exception 'Datos inv├ílidos';end if;
 if p_credito_dias>0 and not private.tiene_funcion('finanzas') then raise exception 'PLAN_REQUIRED: cr├®dito requiere Luxury';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Selecciona entre 1 y 100 ├¡tems';end if;
 if not exists(select 1 from public.clientes c where c.tenant_id=t and c.id=p_cliente) then raise exception 'Cliente inexistente en tu empresa';end if;
 perform pg_advisory_xact_lock(hashtextextended(t::text||':proforma',0));
 select coalesce(max(p.numero),0)+1 into numero from public.proformas p where p.tenant_id=t;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into producto from public.catalogo_maquinaria where tenant_id=t and id=(item->>'id')::uuid;
  if not found then raise exception '├ìtem fuera de tu empresa';end if;
  cantidad:=(item->>'cantidad')::numeric;
  descuento:=coalesce((item->>'descuento')::numeric,0);
  if cantidad is null or cantidad<=0 or cantidad>100000 or cantidad<>round(cantidad,3) or descuento<0 or descuento<>round(descuento,2) then raise exception 'Cantidad/descuento inv├ílidos';end if;
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
 values(pid,t,numero,p_cliente,private.uid(),tok,snapshot,p_metodo,p_credito_dias,
  s0,s5,s15,dsct,i5,i15,s0+s5+s15+i5+i15,(now() at time zone 'America/Guayaquil')::date+p_validez_dias);
 return jsonb_build_object('id',pid,'numero',numero,'token',tok);
end$function$;

CREATE OR REPLACE FUNCTION public.mi_acceso()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('tenant_id',p.tenant_id,'rol',p.rol,'nombre',p.nombre,'ahora',now(),
 'telefono',p.telefono,'avatar_path',p.avatar_path,
 'superadmin',private.es_superadmin(p.tenant_id),
 'facturas_prueba',(select count(*) from public.facturas_sri f where f.tenant_id=p.tenant_id),
 'suscripcion',to_jsonb(s),'empresa',to_jsonb(e),'funciones',jsonb_build_object(
 'facturacion',private.tiene_funcion('facturacion'),'inventario',private.tiene_funcion('inventario'),
 'clientes',private.tiene_funcion('clientes'),'proformas',private.tiene_funcion('proformas'),
 'alquiler',private.tiene_funcion('alquiler'),'finanzas',private.tiene_funcion('finanzas'),
 'analisis',private.tiene_funcion('analisis'),'programada',private.tiene_funcion('programada'),
 'configuracion',private.tiene_funcion('configuracion')))
 from public.usuarios_perfiles p join public.empresas e on e.id=p.tenant_id join public.suscripciones s on s.tenant_id=p.tenant_id
 where p.id=private.uid()
$function$;

CREATE OR REPLACE FUNCTION public.registrar_abono(p_cuota uuid, p_monto numeric, p_metodo text, p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=private.tenant_id(); q public.cuotas; viejo public.movimientos_caja; mid uuid:=gen_random_uuid(); hoy date:=(now() at time zone 'America/Guayaquil')::date;begin
 if t is null or not private.tiene_funcion('finanzas') or private.rol()<>'ADMIN' then raise exception 'PLAN_REQUIRED: abonos requieren Luxury y administrador';end if;
 if p_monto<=0 or p_monto<>round(p_monto,2) or p_metodo not in('01','16','18','19','20') then raise exception 'Monto/medio inv├ílidos';end if;
 perform private.caja_abierta(t,hoy);
 select * into viejo from public.movimientos_caja where tenant_id=t and token=p_token;
 if found then if viejo.cuota_id<>p_cuota or viejo.monto<>p_monto or viejo.metodo_pago<>p_metodo then raise exception 'Token incompatible';end if;return viejo.id;end if;
 select * into q from public.cuotas where tenant_id=t and id=p_cuota for update;
 if not found or p_monto>q.monto-q.pagado then raise exception 'Cuota inexistente o abono excedido';end if;
 update public.cuotas set pagado=pagado+p_monto where tenant_id=t and id=q.id;
 insert into public.movimientos_caja(id,tenant_id,tipo,monto,metodo_pago,categoria,descripcion,cuota_id,creado_por,token)
 values(mid,t,'INGRESO',p_monto,p_metodo,'Cobros','Abono de factura',q.id,private.uid(),p_token);return mid;
end$function$;

CREATE OR REPLACE FUNCTION public.registrar_alquiler_interno(p_cliente uuid, p_items jsonb, p_metodo text, p_salida timestamp with time zone, p_retorno timestamp with time zone, p_garantia numeric, p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=(select private.tenant_id()); c public.clientes%rowtype; e record;
 contrato uuid:=gen_random_uuid(); item jsonb; dias int; total_items numeric:=0;
 num int:=0; linea text; e_id uuid; e_precio numeric;
begin
 if t is null or not private.tiene_funcion('alquiler') then raise exception 'PLAN_REQUIRED: alquiler requiere Pro';end if;
 if p_metodo not in('01','16','18','19','20') or p_garantia<0 or p_salida is null or p_retorno is null or p_retorno<=p_salida then
  raise exception 'Datos inv├ílidos';end if;
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
  linea := linea || e.nombre || ' (' || dias || ' d├¡as) ';
 end loop;
 if num < 1 or total_items <= 0 then raise exception 'Selecciona al menos un equipo';end if;
 insert into public.contratos_alquiler(id,tenant_id,cliente_id,salida,retorno,garantia,estado,creado_por,modo)
 values(contrato,t,c.id,p_salida,p_retorno,p_garantia,'ACTIVO',private.uid(),'VENTA_INTERNA');
 for item in select value from jsonb_array_elements(p_items) loop
  select id, precio into e_id, e_precio from public.catalogo_maquinaria where tenant_id=t and id=(item->>'id')::uuid;
  insert into public.contratos_detalles(tenant_id,contrato_id,equipo_id,tarifa_dia)
   values(t,contrato,e_id,e_precio);
 end loop;
 insert into public.movimientos_caja(tenant_id,tipo,monto,metodo_pago,categoria,descripcion,creado_por,token)
 values(t,'INGRESO',total_items,p_metodo,'ALQUILER_INTERNO',
  'Venta interna de alquiler: ' || linea || ' ┬À Cliente: ' || c.nombre, private.uid(), p_token);
 return contrato;
end$function$;

CREATE OR REPLACE FUNCTION public.registrar_gasto(p_monto numeric, p_metodo text, p_categoria text, p_descripcion text, p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t uuid:=private.tenant_id(); mid uuid:=gen_random_uuid(); viejo public.movimientos_caja; hoy date:=(now() at time zone 'America/Guayaquil')::date;begin
 if t is null or not private.tiene_funcion('finanzas') or private.rol()<>'ADMIN' then raise exception 'PLAN_REQUIRED: gastos requieren Luxury y administrador';end if;
 if p_monto<=0 or p_monto<>round(p_monto,2) or p_metodo not in('01','16','18','19','20') or length(trim(p_descripcion))<2 then raise exception 'Datos inv├ílidos';end if;
 perform private.caja_abierta(t,hoy);
 select * into viejo from public.movimientos_caja where tenant_id=t and token=p_token;
 if found then if viejo.tipo<>'EGRESO' or viejo.monto<>p_monto or viejo.metodo_pago<>p_metodo or viejo.descripcion<>p_descripcion or viejo.categoria<>p_categoria then raise exception 'Token incompatible';end if;return viejo.id;end if;
 insert into public.movimientos_caja(id,tenant_id,tipo,monto,metodo_pago,categoria,descripcion,creado_por,token)
 values(mid,t,'EGRESO',p_monto,p_metodo,p_categoria,p_descripcion,private.uid(),p_token);return mid;
end$function$;

commit;
