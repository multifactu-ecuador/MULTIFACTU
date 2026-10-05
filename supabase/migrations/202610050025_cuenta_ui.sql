-- "Mi cuenta": teléfono, foto de perfil y bucket privado de avatares.
alter table public.usuarios_perfiles add column telefono text, add column avatar_path text;
alter table public.usuarios_perfiles add constraint avatar_prefijo
 check(avatar_path is null or avatar_path like tenant_id::text||'/%');
grant update(telefono,avatar_path) on public.usuarios_perfiles to authenticated;

-- mi_acceso expone los datos personales que la página "Mi cuenta" edita.
create or replace function public.mi_acceso() returns jsonb language sql stable security definer set search_path='' as $$
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
 where p.id=auth.uid()
$$;

insert into storage.buckets(id,name,public,file_size_limit) values
 ('avatares','avatares',false,2097152)
on conflict(id) do nothing;
create policy multifactu_avatares_select on storage.objects for select to authenticated using(
 split_part(name,'/',1)=(select private.tenant_id())::text and bucket_id='avatares');
-- Cada usuario sólo escribe su propia foto: tenant/uuid-del-usuario.ext
create policy multifactu_avatares_insert on storage.objects for insert to authenticated with check(
 bucket_id='avatares' and split_part(name,'/',1)=(select private.tenant_id())::text
 and split_part(name,'/',2) like (auth.uid()::text)||'.%');
create policy multifactu_avatares_update on storage.objects for update to authenticated using(
 bucket_id='avatares' and split_part(name,'/',1)=(select private.tenant_id())::text
 and split_part(name,'/',2) like (auth.uid()::text)||'.%') with check(
 bucket_id='avatares' and split_part(name,'/',1)=(select private.tenant_id())::text
 and split_part(name,'/',2) like (auth.uid()::text)||'.%');
create policy multifactu_avatares_delete on storage.objects for delete to authenticated using(
 bucket_id='avatares' and split_part(name,'/',1)=(select private.tenant_id())::text
 and split_part(name,'/',2) like (auth.uid()::text)||'.%');
