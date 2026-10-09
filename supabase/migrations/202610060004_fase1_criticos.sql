-- Fase 1 del code review: los 7 críticos de la ronda del 6 de octubre.
--
--  1) crear_mi_empresa deja de aceptar p_email del cliente: el email del
--     perfil se deriva de los claims firmados del JWT (mismo lector que
--     private.uid()), nunca del payload. Un email falso en el payload
--     permitía escalada a superadmin (es_superadmin compara por email).
--  7) Versiones legales: el cliente envía 2026-10-05.x pero la base exigía
--     exactamente '2026-10-04' y lanzaba "Debes aceptar los Términos...";
--     el onboarding rechazaba a todo usuario nuevo desde el 4 de octubre.
--     Se valida formato (una versión cambia sin romper el alta) y el acta de
--     consentimiento guarda las versiones reales que aceptó el usuario.
--  2) aprobar_proforma: FOR UPDATE + CAS para que dos clics o dos personas
--     no dupliquen la factura de una misma cotización.
--  3/4) private.reintentar_emision(): barre comprobantes atascados en
--     'Procesando' y los vuelve a disparar (el trigger es AFTER INSERT
--     solamente). pg_cron la corre cada minuto si existe; si no, el propio
--     trigger la ejecuta tras publicar cada INSERT (post-then-sweep).
--     El timeout de pg_net sube de 10s a 60s: la emisión real (firma XAdES
--     + SOAP + autorización) puede superar los 10s anteriores.
--
-- Los críticos 5 (rentalMode en deps de emit), 6 (bloquear NC real sobre
-- factura simulada) y la parte cliente de 1 y 3 viven en el frontend y en
-- las edge functions; este archivo es sólo la capa SQL.

-- ───────────────────────────────────────────────────────────────────────────
-- 7) Versiones legales: del pin fijo a la validación de formato
-- ───────────────────────────────────────────────────────────────────────────
alter table public.consentimientos_legales
  drop constraint if exists consentimientos_legales_version_terminos_check,
  drop constraint if exists consentimientos_legales_version_privacidad_check,
  drop constraint if exists consentimientos_legales_version_encargo_check;
alter table public.consentimientos_legales
  add constraint consentimientos_legales_version_terminos_check
    check(version_terminos ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'),
  add constraint consentimientos_legales_version_privacidad_check
    check(version_privacidad ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'),
  add constraint consentimientos_legales_version_encargo_check
    check(version_encargo ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}');

-- registrar_consentimiento_legal recibe ahora las versiones reales aceptadas
-- por el usuario (antes las fijaba en '2026-10-04' sin importar lo que el
-- usuario había visto en pantalla). version_encargo no viaja desde el
-- cliente: el Contrato de encargo se incorpora por referencia a los Términos,
-- cuya versión sí queda registrada tal cual fue aceptada.
drop function if exists private.registrar_consentimiento_legal(uuid, uuid, text);
drop function if exists private.registrar_consentimiento_legal(text, uuid, text);

create function private.registrar_consentimiento_legal(
 p_usuario_id text,
 p_tenant_id uuid,
 p_canal text,
 p_version_terminos text,
 p_version_privacidad text
) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.consentimientos_legales(
  usuario_id,tenant_id,version_terminos,version_privacidad,version_encargo,canal
 ) values(
  p_usuario_id,p_tenant_id,p_version_terminos,p_version_privacidad,'2026-10-04',p_canal
 ) on conflict(usuario_id,version_terminos,version_privacidad,version_encargo) do nothing;
end$$;
revoke all on function private.registrar_consentimiento_legal(text,uuid,text,text,text) from public,anon,authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1 + 7) public.crear_mi_empresa sin p_email y con versiones por formato
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.crear_mi_empresa(text,text,text,boolean,text,text,text);
drop function if exists public.crear_mi_empresa(text,text,text,boolean,text,text);

create function public.crear_mi_empresa(
 p_empresa text,
 p_identificacion text,
 p_nombre text,
 p_consentimiento boolean,
 p_version_terminos text,
 p_version_privacidad text
) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); v_emp text:=trim(coalesce(p_empresa,'')); v_id text:=trim(coalesce(p_identificacion,''));
 v_nombre text:=trim(coalesce(p_nombre,'')); v_email text;
begin
 if exists(select 1 from public.usuarios_perfiles where id=private.uid()) then raise exception 'Ya tienes una empresa creada';end if;
 if v_emp='' or length(v_emp) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
 if v_id !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC inválido';end if;
 if length(v_id)=10 and not private.validar_cedula(v_id) then raise exception 'Cédula inválida';end if;
 if p_consentimiento is distinct from true
   or p_version_terminos is null or p_version_terminos !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
   or p_version_privacidad is null or p_version_privacidad !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
 then raise exception 'Debes aceptar los Términos y la Política de privacidad vigentes';end if;
 -- El email NUNCA se acepta del payload del cliente: se deriva de los claims
 -- firmados del JWT (mismo lector de private.uid()). Sin claim, queda null.
 v_email := nullif(btrim(coalesce(
   nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email','')),'');
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,v_emp,v_id,v_emp,case when length(v_id)=13 then v_id else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre,email)
 values(private.uid(),t,'ADMIN',coalesce(nullif(v_nombre,''),v_emp),v_email);
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 perform private.registrar_consentimiento_legal(private.uid(),t,'onboarding_oauth',p_version_terminos,p_version_privacidad);
 return t;
end$$;
revoke all on function public.crear_mi_empresa(text,text,text,boolean,text,text) from public,anon;
grant execute on function public.crear_mi_empresa(text,text,text,boolean,text,text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) aprobar_proforma: bloqueo FOR UPDATE + CAS
--    Sin FOR UPDATE, dos aprobaciones simultáneas (doble clic, dos personas)
--    creaban dos facturas para la misma cotización.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.aprobar_proforma(p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.proformas; fid uuid; items_core jsonb;
begin
 if not public.registrar_intento_edge('proforma_acc:'||coalesce(p_token::text,'x'),10,15) then
  raise exception 'Demasiadas consultas para esta cotización; intenta en unos minutos';
 end if;
 select * into p from public.proformas where token_publico=p_token for update;
 if not found then raise exception 'Cotización no encontrada';end if;
 if p.estado='Aprobada' then return jsonb_build_object('estado','Aprobada','factura',p.factura_id);end if;
 if p.estado<>'Enviada' then raise exception 'Esta cotización ya no está disponible (estado: %)',p.estado;end if;
 if p.valida_hasta<(now() at time zone 'America/Guayaquil')::date then raise exception 'Esta cotización expiró el %',p.valida_hasta;end if;
 select jsonb_agg(jsonb_build_object('id',x->>'id','cantidad',(x->>'cantidad')::numeric,'descuento',(x->>'descuento')::numeric))
 into items_core from jsonb_array_elements(p.items) x;
 fid:=private.crear_factura_core(p.tenant_id,p.creado_por,p.cliente_id,items_core,gen_random_uuid(),p.metodo_pago,p.credito_dias,'VENTA',null,null,0);
 update public.proformas set estado='Aprobada',factura_id=fid,aprobada_en=now()
  where id=p.id and estado='Enviada';
 if not found then
  -- Otra sesión ganó la carrera: devolver la factura ya registrada.
  select factura_id into fid from public.proformas where id=p.id;
  return jsonb_build_object('estado','Aprobada','factura',fid);
 end if;
 return jsonb_build_object('estado','Aprobada','factura',fid);
end$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3/4) Barredor de comprobantes atascados + trigger con timeout de 60s
-- ───────────────────────────────────────────────────────────────────────────
do $$
begin
  -- PGLite (tests locales) no distribuye pg_net: allí este archivo se omite.
  if not exists(select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_net no disponible: sin reintento automático de emisión';
    return;
  end if;

  if not exists(select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net with schema extensions;
  end if;

  -- Barre comprobantes atascados en 'Procesando' (>15 minutos): los devuelve
  -- a 'Pendiente' con CAS y los vuelve a disparar. El trigger es AFTER INSERT
  -- solamente, así que un fallo posterior dejaba el comprobante huérfano.
  create or replace function private.reintentar_emision()
  returns void language plpgsql security definer set search_path='' as $fn$
  declare cfg jsonb; r record; destino text;
  begin
    select decrypted_secret into cfg
      from vault.decrypted_secrets where name = 'sri_emision_webhook';
    if cfg is null
       or coalesce(cfg->>'base','') = ''
       or coalesce(cfg->>'secret','') = '' then
      return;
    end if;
    for r in
      select id, tenant_id, 'facturas_sri' as tabla from public.facturas_sri
       where estado='Procesando' and procesamiento_en < now() - interval '15 minutes'
      union all
      select id, tenant_id, 'notas_credito' as tabla from public.notas_credito
       where estado='Procesando' and procesamiento_en < now() - interval '15 minutes'
      order by 3, 1
    loop
      -- CAS: sólo quien logra pasar 'Procesando' a 'Pendiente' re-dispara;
      -- si otra invocación ya lo reclamó, 'found' es falso y se omite.
      if r.tabla = 'facturas_sri' then
        update public.facturas_sri set estado='Pendiente'
         where id=r.id and tenant_id=r.tenant_id and estado='Procesando';
      else
        update public.notas_credito set estado='Pendiente'
         where id=r.id and tenant_id=r.tenant_id and estado='Procesando';
      end if;
      if not found then continue; end if;
      destino := (cfg->>'base') || '/functions/v1/' ||
        case when r.tabla = 'notas_credito' then 'notas-procesar'
             else 'sri-procesar' end;
      perform net.http_post(
        url := destino,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', cfg->>'secret'),
        body := jsonb_build_object(
          'type', 'INSERT', 'schema', 'public', 'table', r.tabla,
          'record', jsonb_build_object('id', r.id, 'tenant_id', r.tenant_id),
          'old_record', null::jsonb),
        timeout_milliseconds := 60000);
    end loop;
  exception when others then
    raise warning 'reintento de emisión fallido: %', sqlerrm;
  end $fn$;

  revoke all on function private.reintentar_emision()
    from public, anon, authenticated;

  -- Trigger: publica el INSERT y después barre los atascados (respaldo si
  -- no hay pg_cron). El timeout de pg_net sube a 60s: la emisión real
  -- (firma XAdES + SOAP + autorización) puede superar los 10s anteriores.
  create or replace function private.emitir_sri_webhook()
  returns trigger language plpgsql security definer set search_path='' as $fn$
  declare cfg jsonb; destino text;
  begin
    select decrypted_secret into cfg
      from vault.decrypted_secrets where name = 'sri_emision_webhook';
    if cfg is null
       or coalesce(cfg->>'base','') = ''
       or coalesce(cfg->>'secret','') = '' then
      return new;
    end if;
    destino := (cfg->>'base') || '/functions/v1/' ||
      case when tg_table_name = 'notas_credito' then 'notas-procesar'
           else 'sri-procesar' end;
    perform net.http_post(
      url := destino,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', cfg->>'secret'),
      body := jsonb_build_object(
        'type', 'INSERT', 'schema', 'public', 'table', tg_table_name,
        'record', jsonb_build_object('id', new.id, 'tenant_id', new.tenant_id),
        'old_record', null::jsonb),
      timeout_milliseconds := 60000);
    perform private.reintentar_emision();
    return new;
  exception when others then
    -- Nunca se aborta el INSERT del negocio por un fallo del webhook.
    raise warning 'emisión automática fallida (%): %', tg_table_name, sqlerrm;
    return new;
  end $fn$;

  revoke all on function private.emitir_sri_webhook()
    from public, anon, authenticated;

  drop trigger if exists emision_sri on public.facturas_sri;
  create trigger emision_sri
    after insert on public.facturas_sri
    for each row execute function private.emitir_sri_webhook();

  drop trigger if exists emision_nota_sri on public.notas_credito;
  create trigger emision_nota_sri
    after insert on public.notas_credito
    for each row execute function private.emitir_sri_webhook();

  -- pg_cron: barre cada minuto aunque no lleguen inserts nuevos. Sin pg_cron
  -- el respaldo es el propio trigger (post-then-sweep).
  begin
    if not exists(select 1 from pg_available_extensions where name = 'pg_cron') then
      raise notice 'pg_cron no disponible: el reintento corre sólo desde el trigger';
    else
      if not exists(select 1 from pg_extension where extname = 'pg_cron') then
        create extension if not exists pg_cron;
      end if;
      if to_regclass('cron.job') is not null then
        if exists(select 1 from cron.job where jobname='multifactu-reintentar-emision') then
          perform cron.unschedule('multifactu-reintentar-emision');
        end if;
        perform cron.schedule('multifactu-reintentar-emision', '* * * * *',
          $job$select private.reintentar_emision()$job$);
      end if;
    end if;
  exception when others then
    raise warning 'pg_cron no programado: %', sqlerrm;
  end;
end $$;
