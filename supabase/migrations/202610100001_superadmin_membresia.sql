-- ═══════════════════════════════════════════════════════════════════════════
-- CRÍTICO 5) SUPERADMIN POR MEMBRESÍA EXPLÍCITA, NO POR CORREO
--
-- Hasta ahora private.es_superadmin comparaba el correo guardado en
-- public.usuarios_perfiles contra un literal. Ese correo llegaba de dos
-- fuentes manipulables:
--   1) la sobrecarga de 7 argumentos de public.crear_mi_empresa, concedida
--      a authenticated, que escribía p_email DEL PAYLOAD del cliente en el
--      perfil (escalada directa: cualquier usuario podía registrarse con el
--      correo del dueño y obtener el bypass de plan);
--   2) el claim 'email' del JWT en la versión de 6 argumentos, sin exigir
--      email_verified.
--
-- A partir de aquí el alto privilegio vive en private.superadmins: una tabla
-- sin privilegios para el cliente (sólo service_role la escribe). El correo
-- deja de ser una credencial; queda como dato del perfil, nada más. La
-- copia de la membresía vigente se hace UNA sola vez al final de este
-- archivo, leyendo el correo existente; después ya no gobierna nada.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists private.superadmins (
  tenant_id uuid primary key,
  agregado_en timestamptz not null default now()
);
-- RLS activada sin políticas: ni siquiera un grant futuro abriría filas a
-- los clientes; service_role es bypassrls y service_role/administradores
-- operan la membresía por API.
alter table private.superadmins enable row level security;
revoke all on table private.superadmins from public, anon, authenticated;
grant select, insert, delete on table private.superadmins to service_role;

-- El único bypass de plan de todo el sistema, ahora por membresía.
create or replace function private.es_superadmin(p_tenant uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from private.superadmins s
    where s.tenant_id = p_tenant
  )
$$;
-- Mismos privilegios que la versión vigente (202610050018:131-132).
revoke all on function private.es_superadmin(uuid) from public,anon,authenticated;
grant execute on function private.es_superadmin(uuid) to service_role;

-- Migración de datos (una sola vez): la membresía actual se copia leyendo
-- el correo que ya estaba registrado. Ésta es la ÚLTIMA apariencia del
-- literal en una regla de acceso; a partir de aquí sólo service_role puede
-- añadir o quitar superadmins (nunca desde el navegador).
insert into private.superadmins(tenant_id)
select p.tenant_id
from public.usuarios_perfiles p
where p.tenant_id is not null
  and lower(p.email) = 'lopeznieto2512@gmail.com'
on conflict do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Se elimina la sobrecarga de 7 argumentos: aceptaba p_email del cliente
--    y lo escribía en el perfil. El frontend sólo llama con 6 argumentos
--    nombrados (Onboarding.tsx), que resuelven a la versión de 6.
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.crear_mi_empresa(text,text,text,boolean,text,text,text);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) La versión de 6 argumentos sigue derivando el perfil del JWT, pero el
--    correo sólo se guarda si viene verificado (email_verified). Sin ese
--    claim el perfil queda sin correo. create or replace conserva los
--    privilegios ya concedidos (execute a authenticated).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crear_mi_empresa(
 p_empresa text,
 p_identificacion text,
 p_nombre text,
 p_consentimiento boolean,
 p_version_terminos text,
 p_version_privacidad text
) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); v_emp text:=trim(coalesce(p_empresa,'')); v_id text:=trim(coalesce(p_identificacion,''));
 v_nombre text:=trim(coalesce(p_nombre,'')); v_claims jsonb; v_email text;
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
 -- firmados del JWT y únicamente si viene verificado (email_verified). El
 -- correo ya no otorga ningún privilegio (ver private.superadmins).
 v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
 v_email := case when lower(coalesce(v_claims->>'email_verified','')) = 'true'
   then nullif(btrim(coalesce(v_claims->>'email','')),'') end;
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,v_emp,v_id,v_emp,case when length(v_id)=13 then v_id else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre,email)
 values(private.uid(),t,'ADMIN',coalesce(nullif(v_nombre,''),v_emp),v_email);
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 perform private.registrar_consentimiento_legal(private.uid(),t,'onboarding_oauth',p_version_terminos,p_version_privacidad);
 return t;
end$$;
