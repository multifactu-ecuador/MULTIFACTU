-- Evidencia de aceptación legal: fecha generada por la base y versiones inmutables.
-- No se guarda IP ni user-agent para respetar minimización de datos; esos datos
-- deben incorporarse solo tras una evaluación jurídica y de seguridad específica.
create table public.consentimientos_legales (
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references auth.users(id) on delete cascade,
 tenant_id uuid not null references public.empresas(id) on delete cascade,
 version_terminos text not null check(version_terminos='2026-10-04'),
 version_privacidad text not null check(version_privacidad='2026-10-04'),
 version_encargo text not null check(version_encargo='2026-10-04'),
 canal text not null check(canal in ('registro_email','onboarding_oauth')),
 aceptado_en timestamptz not null default now(),
 unique(usuario_id,version_terminos,version_privacidad,version_encargo)
);

alter table public.consentimientos_legales enable row level security;
revoke all on public.consentimientos_legales from public,anon,authenticated;
grant select on public.consentimientos_legales to authenticated;
create policy consentimiento_lectura_propia on public.consentimientos_legales
 for select to authenticated using(usuario_id=auth.uid());

create or replace function private.registrar_consentimiento_legal(
 p_usuario_id uuid,
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
revoke all on function private.registrar_consentimiento_legal(uuid,uuid,text) from public,anon,authenticated;

-- Registro por correo: la creación de empresa y la evidencia solo ocurren con
-- aceptación explícita de las versiones vigentes enviadas por la interfaz.
create or replace function private.crear_negocio_al_registrarse() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); identificacion text:=new.raw_user_meta_data->>'identificacion';
 nombre text:=trim(coalesce(new.raw_user_meta_data->>'empresa','')); personal text:=trim(coalesce(new.raw_user_meta_data->>'nombre',''));begin
 if new.raw_user_meta_data ? 'empresa' then
  if nombre is null or length(nombre) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
  if identificacion is null or identificacion !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC requerido';end if;
  if length(identificacion)=10 and not private.validar_cedula(identificacion) then raise exception 'Cédula inválida';end if;
  if new.raw_user_meta_data->>'consentimiento'<>'true'
    or new.raw_user_meta_data->>'version_terminos'<>'2026-10-04'
    or new.raw_user_meta_data->>'version_privacidad'<>'2026-10-04'
  then raise exception 'Debes aceptar los Términos y la Política de privacidad vigentes';end if;
  insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
  values(t,t,nombre,identificacion,nombre,case when length(identificacion)=13 then identificacion else null end);
  insert into public.usuarios_perfiles(id,tenant_id,rol,nombre) values(new.id,t,'ADMIN',coalesce(nullif(personal,''),nombre));
  insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
  insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
  perform private.registrar_consentimiento_legal(new.id,t,'registro_email');
 end if;
 return new;
end$$;

-- Se revoca la versión anterior de la RPC para que no pueda crear empresas sin
-- declarar qué versiones legales se aceptaron.
revoke all on function public.crear_mi_empresa(text,text,text,boolean) from public,anon,authenticated;
create function public.crear_mi_empresa(
 p_empresa text,
 p_identificacion text,
 p_nombre text,
 p_consentimiento boolean,
 p_version_terminos text,
 p_version_privacidad text
) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); v_emp text:=trim(coalesce(p_empresa,'')); v_id text:=trim(coalesce(p_identificacion,''));
 v_nombre text:=trim(coalesce(p_nombre,''));begin
 if exists(select 1 from public.usuarios_perfiles where id=auth.uid()) then raise exception 'Ya tienes una empresa creada';end if;
 if v_emp='' or length(v_emp) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
 if v_id !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC inválido';end if;
 if length(v_id)=10 and not private.validar_cedula(v_id) then raise exception 'Cédula inválida';end if;
 if p_consentimiento is distinct from true
   or p_version_terminos<>'2026-10-04'
   or p_version_privacidad<>'2026-10-04'
 then raise exception 'Debes aceptar los Términos y la Política de privacidad vigentes';end if;
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,v_emp,v_id,v_emp,case when length(v_id)=13 then v_id else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre) values(auth.uid(),t,'ADMIN',coalesce(nullif(v_nombre,''),v_emp));
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 perform private.registrar_consentimiento_legal(auth.uid(),t,'onboarding_oauth');
 return t;
end$$;
revoke all on function public.crear_mi_empresa(text,text,text,boolean,text,text) from public,anon;
grant execute on function public.crear_mi_empresa(text,text,text,boolean,text,text) to authenticated;
