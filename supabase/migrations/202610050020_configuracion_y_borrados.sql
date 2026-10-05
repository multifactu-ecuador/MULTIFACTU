-- 1) mi_acceso expone la función 'configuracion' (Plantillas docs).
--    Hoy ningún plan la incluye en private.tiene_funcion_para: sólo pasa el
--    bypass del superadmin. Cuando se decida abrirla a un plan, basta con
--    añadirla a la lista del tier correspondiente.
create or replace function public.mi_acceso() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tenant_id',p.tenant_id,'rol',p.rol,'nombre',p.nombre,'ahora',now(),
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

-- 2) Eliminar cliente con regla de negocio: prohibido si tiene deuda
--    pendiente; CONSUMIDOR FINAL (07) está protegido; si tiene historial de
--    operaciones la FK manda y se devuelve un mensaje claro.
create or replace function public.eliminar_cliente(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare t uuid:=private.tenant_id(); deuda numeric;
begin
 if t is null or private.rol()<>'ADMIN' then raise exception 'Requiere administrador';end if;
 select coalesce(sum(q.monto-q.pagado),0) into deuda
 from public.cuotas q where q.tenant_id=t and q.cliente_id=p_id;
 if deuda>0 then
   raise exception 'No se puede eliminar: el cliente tiene deuda pendiente de $%', trim(to_char(deuda,'FM999999990.00'));
 end if;
 delete from public.clientes where tenant_id=t and id=p_id and tipo_id<>'07';
 if not found then raise exception 'Cliente inexistente o protegido';end if;
exception when foreign_key_violation then
 raise exception 'No se puede eliminar: el cliente tiene operaciones registradas (facturas, alquileres o cotizaciones)';
end$$;
revoke all on function public.eliminar_cliente(uuid) from public,anon;
grant execute on function public.eliminar_cliente(uuid) to authenticated;
