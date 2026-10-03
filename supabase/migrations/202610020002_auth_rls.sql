create function private.validar_cedula(v text) returns boolean language plpgsql immutable set search_path='' as $$
declare suma int:=0; n int; i int; begin
 if v !~ '^[0-9]{10}$' then return false; end if;
 if left(v,2)::int not between 1 and 24 or substring(v,3,1)::int>5 then return false;end if;
 for i in 1..9 loop n:=substring(v,i,1)::int * case when i%2=1 then 2 else 1 end;
 suma:=suma+case when n>9 then n-9 else n end;end loop;
 return (10-suma%10)%10=substring(v,10,1)::int;
end$$;
create function private.crear_negocio_al_registrarse() returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid(); identificacion text:=new.raw_user_meta_data->>'identificacion';
 nombre text:=trim(new.raw_user_meta_data->>'empresa'); personal text:=trim(new.raw_user_meta_data->>'nombre');begin
 if nombre is null or length(nombre) not between 2 and 160 then raise exception 'Nombre de empresa requerido';end if;
 if identificacion is null or identificacion !~ '^([0-9]{10}|[0-9]{13})$' then raise exception 'Cédula o RUC requerido';end if;
 if length(identificacion)=10 and not private.validar_cedula(identificacion) then raise exception 'Cédula inválida';end if;
 if new.raw_user_meta_data->>'consentimiento'<>'true' or new.raw_user_meta_data->>'consentimiento' is null then raise exception 'Acepta términos y privacidad';end if;
 insert into public.empresas(id,tenant_id,nombre,identificacion_registro,razon_social,ruc)
 values(t,t,nombre,identificacion,nombre,case when length(identificacion)=13 then identificacion else null end);
 insert into public.usuarios_perfiles(id,tenant_id,rol,nombre) values(new.id,t,'ADMIN',coalesce(nullif(personal,''),nombre));
 insert into public.suscripciones(tenant_id,plan,estado,inicio,fin) values(t,'luxury','trial',now(),now()+interval '7 days');
 insert into public.clientes(tenant_id,tipo_id,identificacion,nombre,direccion) values(t,'07','9999999999999','CONSUMIDOR FINAL','Ecuador');
 return new;
end$$;
create trigger multifactu_auth_user_created after insert on auth.users for each row execute function private.crear_negocio_al_registrarse();

-- SECURITY DEFINER evita recursión de RLS sobre usuarios_perfiles.
-- search_path vacío y nombres calificados evitan sustitución de objetos.
create function private.tenant_id() returns uuid language sql stable security definer set search_path='' as $$
 select p.tenant_id from public.usuarios_perfiles p where p.id=auth.uid()
$$;
create function private.rol() returns text language sql stable security definer set search_path='' as $$
 select p.rol from public.usuarios_perfiles p where p.id=auth.uid()
$$;
create function private.tiene_funcion(funcion text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select s.estado in ('trial','active') and now()>=s.inicio and now()<s.fin and
 (funcion in ('facturacion','inventario','clientes','servicios','proformas') or
 (funcion='alquiler' and (s.estado='trial' or s.plan in('pro','luxury'))) or
 (funcion in ('finanzas','analisis','programada') and (s.estado='trial' or s.plan='luxury')))
 from public.suscripciones s where s.tenant_id=private.tenant_id()),false)
$$;
-- Consulta del frontend con el reloj del servidor; no concede privilegios.
create function public.mi_acceso() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tenant_id',p.tenant_id,'rol',p.rol,'nombre',p.nombre,'ahora',now(),
 'suscripcion',to_jsonb(s),'empresa',to_jsonb(e),'funciones',jsonb_build_object(
 'facturacion',private.tiene_funcion('facturacion'),'inventario',private.tiene_funcion('inventario'),
 'clientes',private.tiene_funcion('clientes'),'proformas',private.tiene_funcion('proformas'),
 'alquiler',private.tiene_funcion('alquiler'),'finanzas',private.tiene_funcion('finanzas'),
 'analisis',private.tiene_funcion('analisis'),'programada',private.tiene_funcion('programada')))
 from public.usuarios_perfiles p join public.empresas e on e.id=p.tenant_id join public.suscripciones s on s.tenant_id=p.tenant_id
 where p.id=auth.uid()
$$;

alter table public.empresas enable row level security;
alter table public.usuarios_perfiles enable row level security;
alter table public.suscripciones enable row level security;
create policy empresa_read on public.empresas for select to authenticated using(id=(select private.tenant_id()));
create policy empresa_update on public.empresas for update to authenticated
 using(id=(select private.tenant_id()) and (select private.rol())='ADMIN' and private.tiene_funcion('facturacion'))
 with check(id=(select private.tenant_id()) and tenant_id=id);
create policy perfil_read on public.usuarios_perfiles for select to authenticated using(tenant_id=(select private.tenant_id()));
create policy perfil_nombre on public.usuarios_perfiles for update to authenticated
 using(tenant_id=(select private.tenant_id()) and (id=auth.uid() or (select private.rol())='ADMIN'))
 with check(tenant_id=(select private.tenant_id()));
create policy suscripcion_read on public.suscripciones for select to authenticated using(tenant_id=(select private.tenant_id()));

-- CRUD siempre se limita a la empresa autenticada; roles y concesiones pueden ser más estrictos.
-- Las tablas fiscales/ledger son inmutables desde el navegador: sus RPC y Edge Function son los escritores autorizados.
do $$declare t text; f text; admin_only boolean;begin
 foreach t in array array['clientes','proveedores','catalogo_maquinaria','contratos_alquiler','contratos_detalles','secuenciales_sri','facturas_sri','factura_detalles','notas_credito','cuotas','plantillas_gastos','cuentas_por_pagar','movimientos_caja','cierres_caja'] loop
 f:=case when t in('proveedores','cuotas','plantillas_gastos','cuentas_por_pagar','movimientos_caja','cierres_caja') then 'finanzas'
 when t in('contratos_alquiler','contratos_detalles') then 'alquiler' when t='catalogo_maquinaria' then 'inventario' else 'facturacion' end;
 admin_only:=f='finanzas';
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using(tenant_id=(select private.tenant_id()) and private.tiene_funcion(%L) %s)',t,f,case when admin_only then 'and (select private.rol())=''ADMIN''' else '' end);
 execute format('create policy tenant_insert on public.%I for insert to authenticated with check(tenant_id=(select private.tenant_id()) and private.tiene_funcion(%L))',t,f);
 execute format('create policy tenant_update on public.%I for update to authenticated using(tenant_id=(select private.tenant_id()) and private.tiene_funcion(%L) and (select private.rol())=''ADMIN'') with check(tenant_id=(select private.tenant_id()) and private.tiene_funcion(%L))',t,f,f);
 execute format('create policy tenant_delete on public.%I for delete to authenticated using(tenant_id=(select private.tenant_id()) and private.tiene_funcion(%L) and (select private.rol())=''ADMIN'')',t,f);
 end loop;end$$;
-- Nunca confiar en los grants predeterminados del proyecto.
revoke all on all tables in schema public from anon,authenticated;
grant select on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant update(nombre,razon_social,ruc,direccion,ambiente_sri,establecimiento,punto_emision,ruta_p12,logo_path,regimen,obligado_contabilidad) on public.empresas to authenticated;
grant update(nombre) on public.usuarios_perfiles to authenticated;
grant insert,update,delete on public.clientes,public.proveedores,public.catalogo_maquinaria,public.plantillas_gastos,public.cuentas_por_pagar to authenticated;
-- Impedir que CAJERO inserte inventario, proveedores o gastos aunque conozca la API.
create policy admin_mutations_catalog on public.catalogo_maquinaria as restrictive for insert to authenticated
 with check((select private.rol())='ADMIN');
-- Políticas restrictivas de INSERT; SELECT conserva acceso al catálogo para POS.
do $$declare t text;begin foreach t in array array['proveedores','plantillas_gastos','cuentas_por_pagar'] loop
 execute format('create policy insert_admin on public.%I as restrictive for insert to authenticated with check((select private.rol())=''ADMIN'')',t);
 end loop;end$$;

create view public.saldos_clientes with(security_invoker=true) as
 select c.tenant_id,c.id,c.nombre,coalesce(sum(q.monto-q.pagado),0)::numeric(14,2) saldo_credito
 from public.clientes c left join public.cuotas q on q.tenant_id=c.tenant_id and q.cliente_id=c.id group by c.tenant_id,c.id,c.nombre;
create view public.saldos_proveedores with(security_invoker=true) as
 select p.tenant_id,p.id,p.razon_social,coalesce(sum(c.monto-c.pagado),0)::numeric(14,2) saldo_credito
 from public.proveedores p left join public.cuentas_por_pagar c on c.tenant_id=p.tenant_id and c.proveedor_id=p.id group by p.tenant_id,p.id,p.razon_social;
grant select on public.saldos_clientes,public.saldos_proveedores to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.tenant_id(),private.rol(),private.tiene_funcion(text) to authenticated,service_role;
revoke all on function public.mi_acceso() from public,anon;
grant execute on function public.mi_acceso() to authenticated;
