-- Onboarding OAuth: el trigger ya no exige metadata completa.
-- Usuarios creados con Google no traen empresa/cédula en raw_user_meta_data;
-- en ese caso NO se crea perfil y el frontend redirige a /onboarding, donde
-- la RPC crear_mi_empresa completa el alta después.
create or replace function private.crear_negocio_al_registrarse() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); identificacion text:=new.raw_user_meta_data->>'identificacion';
 nombre text:=trim(coalesce(new.raw_user_meta_data->>'empresa','')); personal text:=trim(coalesce(new.raw_user_meta_data->>'nombre',''));begin
 -- Ruta clásica (email/contraseña): metadata completa -> crear negocio aquí.
 if new.raw_user_meta_data ? 'empresa' then
  if nombre is null or length(nombre) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
  if identificacion is null or identificacion !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC requerido';end if;
  if length(identificacion)=10 and not private.validar_cedula(identificacion) then raise exception 'Cédula inválida';end if;
  if new.raw_user_meta_data->>'consentimiento'<>'true' then raise exception 'Acepta términos y privacidad';end if;
  insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
  values(t,t,nombre,identificacion,nombre,case when length(identificacion)=13 then identificacion else null end);
  insert into public.usuarios_perfiles(id,tenant_id,rol,nombre) values(new.id,t,'ADMIN',coalesce(nullif(personal,''),nombre));
  insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
  insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
  return new;
 end if;
 -- Ruta OAuth (Google, etc.): no hay metadata fiscal; se permite el alta y el
 -- usuario completa sus datos en /onboarding con crear_mi_empresa.
 return new;
end$$;

create or replace function public.crear_mi_empresa(p_empresa text, p_identificacion text, p_nombre text, p_consentimiento boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); v_emp text:=trim(coalesce(p_empresa,'')); v_id text:=trim(coalesce(p_identificacion,''));
 v_nombre text:=trim(coalesce(p_nombre,''));begin
 if exists(select 1 from public.usuarios_perfiles where id=auth.uid()) then raise exception 'Ya tienes una empresa creada';end if;
 if v_emp='' or length(v_emp) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
 if v_id !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC inválido';end if;
 if length(v_id)=10 and not private.validar_cedula(v_id) then raise exception 'Cédula inválida';end if;
 if p_consentimiento is distinct from true then raise exception 'Acepta términos y privacidad';end if;
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,v_emp,v_id,v_emp,case when length(v_id)=13 then v_id else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre) values(auth.uid(),t,'ADMIN',coalesce(nullif(v_nombre,''),v_emp));
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 return t;
end$$;
revoke all on function public.crear_mi_empresa(text,text,text,boolean) from public,anon;
grant execute on function public.crear_mi_empresa(text,text,text,boolean) to authenticated;
