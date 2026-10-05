-- ============================================================
-- Fase 3 (one-shot): re-apuntar los datos del único usuario que
-- existía en Supabase Auth a su cuenta de Clerk.
--
--   7a94ea41-4a9e-45e9-b331-50dbee47a279 (lopeznieto2512@gmail.com)
--     → user_3KIM7GldJzJz9UcAtd9jBLzCLmg (multifactu@gmail.com)
--
-- Es la misma persona: en Clerk la cuenta nació con Google
-- (multifactu@gmail.com) y lopeznieto2512@gmail.com se añadió como
-- identificador secundario, así que ambos caminos de acceso caen en
-- el mismo sub. El email del perfil se rellena en 00060001 desde
-- auth.users (queda lopeznieto2512@gmail.com, que es el que usa
-- private.es_superadmin).
--
-- Las FK compuestas hacia usuarios_perfiles(tenant_id,id) se capturan
-- con pg_get_constraintdef, se dropean, se re-apuntan los datos y se
-- recrean al final: no hay orden de UPDATE válido con la restricción
-- presente (hijos primero viola contra el padre viejo, padre primero
-- viola contra los hijos viejos). Si una tabla no existiera o hubiera
-- filas huérfanas, la recreación falla y la transacción entera se
-- aborta sin aplicar nada (fallo seguro).
--
-- En bases de test (PGLite) no hay filas con esos ids: todo es
-- no-op y sólo se valida sintaxis/nombres.
begin;
set search_path = public, pg_temp;

do $$
declare
  viejo  text := '7a94ea41-4a9e-45e9-b331-50dbee47a279';
  nuevo  text := 'user_3KIM7GldJzJz9UcAtd9jBLzCLmg';
  con    record;
  ddl    text;
  cola   text[] := '{}';
begin
  -- 1) Capturar y soltar las FK que referencian usuarios_perfiles.
  for con in
    select c.conname,
           c.conrelid::regclass::text as tabla,
           pg_catalog.pg_get_constraintdef(c.oid) as def
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.usuarios_perfiles'::regclass
  loop
    ddl := format('alter table %s add constraint %I %s',
                  con.tabla, con.conname, con.def);
    cola := cola || ddl;
    execute format('alter table %s drop constraint %I', con.tabla, con.conname);
  end loop;

  -- 2) Hijos primero (hoy sin restricción activa, así que no hay
  --    dependencia circular): todas las columnas de identidad ya son
  --    text desde 202610060001.
  update public.consentimientos_legales set usuario_id = nuevo where usuario_id = viejo;
  update public.emisor_firmas           set uploaded_by = nuevo where uploaded_by = viejo;
  update public.contratos_alquiler      set creado_por  = nuevo where creado_por  = viejo;
  update public.facturas_sri            set creado_por  = nuevo where creado_por  = viejo;
  update public.movimientos_caja        set creado_por  = nuevo where creado_por  = viejo;
  update public.cierres_caja            set creado_por  = nuevo where creado_por  = viejo;
  update public.proformas               set creado_por  = nuevo where creado_por  = viejo;
  update public.pedidos_planes          set usuario_id  = nuevo where usuario_id  = viejo;
  update public.auditoria               set actor_id    = nuevo where actor_id    = viejo;

  -- 3) Padre (PK de usuarios_perfiles).
  update public.usuarios_perfiles set id = nuevo where id = viejo;

  -- 4) Correo del perfil: garantizar el que usa private.es_superadmin
  --    aunque el backfill de 00060001 no haya corrido en esta base.
  update public.usuarios_perfiles
     set email = 'lopeznieto2512@gmail.com'
   where id = nuevo and email is null;

  -- 5) Recrear las FK capturadas.
  foreach ddl in array cola loop
    execute ddl;
  end loop;
end $$;

commit;
