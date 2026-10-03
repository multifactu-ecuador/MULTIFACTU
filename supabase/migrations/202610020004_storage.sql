-- Certificados y documentos son privados; nunca generar URLs públicas para .p12.
insert into storage.buckets(id,name,public,file_size_limit) values
 ('certificados','certificados',false,5242880),('documentos','documentos',false,10485760),('logos','logos',false,2097152)
on conflict(id) do nothing;
-- storage.objects ya pertenece a Supabase y tiene RLS habilitado; no alterar su propietario.
create policy multifactu_storage_select on storage.objects for select to authenticated using(
 split_part(name,'/',1)=(select private.tenant_id())::text and
 ((bucket_id='logos') or (bucket_id='documentos' and private.tiene_funcion('facturacion')) or
 (bucket_id='certificados' and private.rol()='ADMIN' and private.tiene_funcion('facturacion'))));
create policy multifactu_storage_insert on storage.objects for insert to authenticated with check(
 bucket_id in('certificados','logos') and split_part(name,'/',1)=(select private.tenant_id())::text
 and private.rol()='ADMIN' and private.tiene_funcion('facturacion'));
create policy multifactu_storage_update on storage.objects for update to authenticated using(
 bucket_id in('certificados','logos') and split_part(name,'/',1)=(select private.tenant_id())::text and private.rol()='ADMIN' and private.tiene_funcion('facturacion')) with check(
 bucket_id in('certificados','logos') and split_part(name,'/',1)=(select private.tenant_id())::text and private.rol()='ADMIN' and private.tiene_funcion('facturacion'));
create policy multifactu_storage_delete on storage.objects for delete to authenticated using(
 bucket_id in('certificados','logos') and split_part(name,'/',1)=(select private.tenant_id())::text and private.rol()='ADMIN' and private.tiene_funcion('facturacion'));
-- Documentos fiscales: sólo el backend los escribe y no se permite borrarlos desde la UI.
