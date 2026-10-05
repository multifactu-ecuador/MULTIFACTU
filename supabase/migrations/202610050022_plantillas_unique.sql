-- Corrige las restricciones de plantillas_documento:
-- antes unique(tenant_id,tipo,es_predeterminada), que sólo permitía 2
-- plantillas por tipo y rompía "Duplicar" y el upsert con onConflict
-- (tenant_id,tipo,nombre). Ahora: nombre único por tipo y, con índice
-- parcial, una sola plantilla predeterminada por tipo.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'plantillas_documento'
      and con.contype = 'u'
  loop
    execute format('alter table public.plantillas_documento drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.plantillas_documento
  add constraint plantillas_nombre_unico unique(tenant_id, tipo, nombre);

-- Una sola predeterminada por empresa y tipo (el resto puede ser copias).
create unique index if not exists plantillas_una_predeterminada
  on public.plantillas_documento(tenant_id, tipo)
  where es_predeterminada;
