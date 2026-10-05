-- Contraseña del .p12 cifrada con Supabase Vault (pgsodium).
-- Antes: public.empresas.p12_password en texto plano (migración 007).
-- Ahora: el valor vive cifrado en vault.secrets; la empresa sólo guarda la
-- referencia opaca p12_secret_id. Nadie con la clave anon/authenticated puede
-- leer la contraseña; el backend (service_role) la descifra con una RPC
-- exclusiva. Los valores heredados se migran al Vault antes de eliminar la
-- columna, así que ninguna empresa pierde su configuración.

-- 1) Extensión Vault. En PGlite (pruebas locales WASM) la extensión C no
--    existe: se crea un shim con la misma API que sólo usan los tests.
--    En Supabase real la extensión siempre está disponible y este shim jamás
--    se instala.
do $$
begin
  if exists(select 1 from pg_available_extensions where name = 'supabase_vault') then
    if not exists(select 1 from pg_extension where extname = 'supabase_vault') then
      create extension supabase_vault with schema vault;
    end if;
  else
    raise notice 'supabase_vault no disponible: instalando shim SOLO para pruebas';
    create schema if not exists vault;
    create table if not exists vault.secrets(
      id uuid primary key default gen_random_uuid(),
      name text,
      description text not null default '',
      secret text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create or replace function vault.create_secret(
      new_secret text, new_name text default null, new_description text default null
    ) returns uuid language plpgsql as $shim$
    declare sid uuid;
    begin
      insert into vault.secrets(name, description, secret)
      values (new_name, coalesce(new_description, ''), new_secret)
      returning id into sid;
      return sid;
    end $shim$;
    create or replace view vault.decrypted_secrets as
      select id, name, description, secret as decrypted_secret, created_at, updated_at
      from vault.secrets;
  end if;
end $$;

-- 2) Referencia opaca al secreto. Sin GRANT para authenticated: sólo la RPC
--    security definer la escribe; service_role la usa para localizar el secreto.
alter table public.empresas add column if not exists p12_secret_id uuid;

-- 3) Migrar contraseñas existentes en texto plano al Vault.
do $$
declare e record;
begin
  for e in select id, p12_password from public.empresas
           where p12_password is not null and p12_password <> '' loop
    update public.empresas
    set p12_secret_id = vault.create_secret(
      e.p12_password, 'p12_' || e.id::text,
      'Contraseña del certificado .p12 de la empresa')
    where id = e.id;
  end loop;
end $$;

-- 4) Eliminar la columna en claro. Los privilegios de columna concedidos en la
--    migración 007 caen con ella automáticamente.
alter table public.empresas drop column if exists p12_password;

-- 5) Escritura: únicamente vía RPC. Mismas validaciones que el resto de
--    operaciones sensibles: tenant resuelto del JWT, rol ADMIN y plan vigente.
--    La rotación reemplaza el secreto en su sitio (mismo id), sin huérfanos.
create or replace function public.guardar_p12_password(p_password text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t uuid := private.tenant_id();
  viejo uuid;
begin
  if t is null or private.rol() <> 'ADMIN' or not private.tiene_funcion('facturacion') then
    raise exception 'PLAN_REQUIRED: requiere administrador con suscripción activa';
  end if;
  if p_password is null or length(p_password) < 1 or length(p_password) > 128 then
    raise exception 'Contraseña inválida';
  end if;

  select e.p12_secret_id into viejo from public.empresas e where e.id = t;

  if viejo is not null then
    -- UPDATE dispara el re-cifrado interno de Vault (trigger de vault.secrets).
    update vault.secrets s set secret = p_password where s.id = viejo;
    if not found then viejo := null; end if; -- secreto borrado fuera de banda
  end if;

  if viejo is null then
    update public.empresas e
    set p12_secret_id = vault.create_secret(
      p_password, 'p12_' || t::text,
      'Contraseña del certificado .p12 de la empresa')
    where e.id = t;
  end if;
end $$;

-- 6) Lectura: SOLO el backend (Edge Functions con service_role). Defensa en
--    profundidad: aunque alguien conceda EXECUTE por error, la función exige
--    el claim role=service_role del JWT que firma Supabase.
create or replace function public.leer_p12_password(p_tenant uuid)
returns text language plpgsql security definer stable set search_path = '' as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       '') <> 'service_role' then
    raise exception 'Solo el backend puede leer la contraseña del certificado';
  end if;
  return (
    select ds.decrypted_secret
    from vault.decrypted_secrets ds
    join public.empresas e on e.p12_secret_id = ds.id
    where e.id = p_tenant
  );
end $$;

-- 7) Privilegios: el navegador escribe pero jamás lee; el backend lee pero
--    sólo con service_role.
revoke all on function public.guardar_p12_password(text) from public, anon;
grant execute on function public.guardar_p12_password(text) to authenticated;
revoke all on function public.leer_p12_password(uuid) from public, anon, authenticated;
grant execute on function public.leer_p12_password(uuid) to service_role;
