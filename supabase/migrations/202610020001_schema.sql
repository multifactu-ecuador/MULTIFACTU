-- PostgreSQL nativo. Ejecutar migraciones en orden como propietario de la base.
-- No se acepta tenant_id, rol ni plan provenientes de user_metadata.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.empresas (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null unique check (tenant_id=id),
 nombre text not null check(length(nombre) between 2 and 160),
 identificacion_registro text not null unique check(identificacion_registro ~ '^([0-9]{10}|[0-9]{13})$'),
 identidad text generated always as
 (case when length(identificacion_registro)=10 or substring(identificacion_registro,3,1)::int<6
 then 'natural:'||left(identificacion_registro,10) else 'ruc:'||identificacion_registro end) stored unique,
 ruc text check(ruc ~ '^[0-9]{13}$'), razon_social text not null, direccion text not null default '',
 ambiente_sri text not null default 'pruebas' check(ambiente_sri in ('pruebas','produccion')),
 regimen text not null default 'general' check(regimen in ('general','rimpe_emprendedor','rimpe_negocio_popular')),
 obligado_contabilidad boolean not null default false,
 establecimiento text not null default '001' check(establecimiento ~ '^[0-9]{3}$' and establecimiento<>'000'),
 punto_emision text not null default '001' check(punto_emision ~ '^[0-9]{3}$' and punto_emision<>'000'),
 ruta_p12 text check(ruta_p12 is null or split_part(ruta_p12,'/',1)=tenant_id::text),
 logo_path text check(logo_path is null or split_part(logo_path,'/',1)=tenant_id::text),
 creado_en timestamptz not null default now()
);
create table public.usuarios_perfiles (
 id uuid primary key references auth.users(id) on delete cascade,
 tenant_id uuid not null references public.empresas(id),
 rol text not null check(rol in ('ADMIN','CAJERO')), nombre text not null,
 unique(tenant_id,id)
);
create table public.suscripciones (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null unique references public.empresas(id),
 plan text not null default 'luxury' check(plan in ('inicial','pro','luxury')),
 estado text not null default 'trial' check(estado in ('trial','active','suspended','expired')),
 inicio timestamptz not null default now(), fin timestamptz not null default now()+interval '7 days',
 check(fin>inicio)
);
create table public.clientes (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 tipo_id text not null check(tipo_id in ('04','05','07')), identificacion text not null,
 nombre text not null check(length(nombre)>1), email text not null default '', direccion text not null default '',
 -- El saldo se calcula desde cuotas/abonos, no se edita como dinero libre.
 limite_credito numeric(14,2) not null default 0 check(limite_credito>=0),
 unique(tenant_id,id), unique(tenant_id,identificacion),
 check((tipo_id='04' and identificacion ~ '^[0-9]{13}$') or
 (tipo_id='05' and identificacion ~ '^[0-9]{10}$') or
 (tipo_id='07' and identificacion='9999999999999' and nombre='CONSUMIDOR FINAL'))
);
create table public.proveedores (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 ruc text not null check(ruc ~ '^[0-9]{13}$'), razon_social text not null,
 email text not null default '', direccion text not null default '',
 unique(tenant_id,id), unique(tenant_id,ruc)
);
create table public.catalogo_maquinaria (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 codigo text not null, nombre text not null,
 tipo text not null check(tipo in ('EQUIPO','PRODUCTO','SERVICIO')),
 estado text not null default 'Disponible' check(estado in ('Disponible','Alquilado','Mantenimiento')),
 costo numeric(14,2) not null default 0 check(costo>=0),
 precio numeric(14,2) not null check(precio>=0), -- equipo: tarifa por día; producto/servicio: unidad
 iva smallint not null default 15 check(iva in (0,5,15)),
 stock numeric(14,3) not null default 0 check(stock>=0),
 unique(tenant_id,id), unique(tenant_id,codigo)
);
create table public.contratos_alquiler (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 cliente_id uuid not null, salida timestamptz not null, retorno timestamptz not null,
 retorno_real timestamptz, garantia numeric(14,2) not null default 0 check(garantia>=0),
 estado text not null default 'ACTIVO' check(estado in ('ACTIVO','DEVUELTO','CANCELADO')),
 condiciones text not null default '', creado_por uuid not null,
 unique(tenant_id,id), check(retorno>salida),
 foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id),
 foreign key(tenant_id,creado_por) references public.usuarios_perfiles(tenant_id,id)
);
create table public.contratos_detalles (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 contrato_id uuid not null, equipo_id uuid not null,
 tarifa_dia numeric(14,2) not null check(tarifa_dia>=0),
 unique(tenant_id,id), unique(contrato_id,equipo_id),
 foreign key(tenant_id,contrato_id) references public.contratos_alquiler(tenant_id,id),
 foreign key(tenant_id,equipo_id) references public.catalogo_maquinaria(tenant_id,id)
);
create table public.secuenciales_sri (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 ambiente text not null, establecimiento text not null, punto_emision text not null, tipo text not null check(tipo in ('01','04')),
 ultimo bigint not null default 0 check(ultimo between 0 and 999999999),
 unique(tenant_id,ambiente,establecimiento,punto_emision,tipo)
);
create table public.facturas_sri (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 cliente_id uuid not null, contrato_id uuid, creado_por uuid not null,
 token uuid not null, fecha date not null default (now() at time zone 'America/Guayaquil')::date,
 ambiente_sri text not null default 'pruebas', establecimiento text not null, punto_emision text not null,
 secuencial bigint not null check(secuencial between 1 and 999999999),
 clave_acceso text unique check(clave_acceso ~ '^[0-9]{49}$'), numero_autorizacion text, fecha_autorizacion timestamptz,
 estado text not null default 'Pendiente' check(estado in ('Pendiente','Procesando','Autorizada','Error')),
 simulacion boolean not null default true, mensaje text,
 subtotal_0 numeric(14,2) not null default 0, subtotal_5 numeric(14,2) not null default 0,
 subtotal_15 numeric(14,2) not null default 0, descuentos numeric(14,2) not null default 0,
 iva_5 numeric(14,2) not null default 0, iva_15 numeric(14,2) not null default 0,
 total numeric(14,2) not null default 0 check(total>=0),
 metodo_pago text not null check(metodo_pago in ('01','16','18','19','20')),
 credito_dias integer not null default 0 check(credito_dias between 0 and 365),
 xml_borrador text, xml_firmado text, xml_autorizado text,
 emisor_snapshot jsonb not null, cliente_snapshot jsonb not null,
 claim_token uuid, procesamiento_en timestamptz, creado_en timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,token),
 unique(tenant_id,ambiente_sri,establecimiento,punto_emision,secuencial),
 check(total=subtotal_0+subtotal_5+subtotal_15+iva_5+iva_15),
 foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id),
 foreign key(tenant_id,contrato_id) references public.contratos_alquiler(tenant_id,id),
 foreign key(tenant_id,creado_por) references public.usuarios_perfiles(tenant_id,id)
);
create table public.factura_detalles (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 factura_id uuid not null, catalogo_id uuid not null, descripcion text not null,
 cantidad numeric(14,3) not null check(cantidad>0), precio numeric(14,2) not null check(precio>=0),
 costo_snapshot numeric(14,2) not null, descuento numeric(14,2) not null check(descuento>=0),
 iva smallint not null check(iva in(0,5,15)), base numeric(14,2) not null check(base>=0), impuesto numeric(14,2) not null check(impuesto>=0),
 unique(tenant_id,id),
 foreign key(tenant_id,factura_id) references public.facturas_sri(tenant_id,id),
 foreign key(tenant_id,catalogo_id) references public.catalogo_maquinaria(tenant_id,id)
);
create table public.notas_credito (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id), factura_id uuid not null,
 clave_acceso text unique check(clave_acceso ~ '^[0-9]{49}$'), numero_autorizacion text, fecha_autorizacion timestamptz,
 estado text not null default 'Pendiente' check(estado in ('Pendiente','Procesando','Autorizada','Error')),
 simulacion boolean not null default true, motivo text not null,
 subtotal_0 numeric(14,2) not null default 0, subtotal_5 numeric(14,2) not null default 0, subtotal_15 numeric(14,2) not null default 0,
 iva_5 numeric(14,2) not null default 0, iva_15 numeric(14,2) not null default 0, total numeric(14,2) not null check(total>=0),
 xml_firmado text, creado_en timestamptz not null default now(), unique(tenant_id,id),
 foreign key(tenant_id,factura_id) references public.facturas_sri(tenant_id,id)
);
create table public.cuotas (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 factura_id uuid not null, cliente_id uuid not null, vencimiento date not null,
 monto numeric(14,2) not null check(monto>0), pagado numeric(14,2) not null default 0 check(pagado>=0 and pagado<=monto),
 unique(tenant_id,id), foreign key(tenant_id,factura_id) references public.facturas_sri(tenant_id,id),
 foreign key(tenant_id,cliente_id) references public.clientes(tenant_id,id)
);
create table public.plantillas_gastos (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 nombre text not null, categoria text not null, monto numeric(14,2) not null check(monto>0),
 dia_mes smallint not null check(dia_mes between 1 and 31), proveedor_id uuid,
 activa boolean not null default true, unique(tenant_id,id),
 foreign key(tenant_id,proveedor_id) references public.proveedores(tenant_id,id)
);
create table public.cuentas_por_pagar (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id), proveedor_id uuid not null,
 descripcion text not null, monto numeric(14,2) not null check(monto>0), pagado numeric(14,2) not null default 0 check(pagado>=0 and pagado<=monto),
 vencimiento date not null, unique(tenant_id,id), foreign key(tenant_id,proveedor_id) references public.proveedores(tenant_id,id)
);
create table public.movimientos_caja (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id),
 tipo text not null check(tipo in ('INGRESO','EGRESO','GARANTIA','DEVOLUCION_GARANTIA')),
 monto numeric(14,2) not null check(monto>0), metodo_pago text not null check(metodo_pago in('01','16','18','19','20')),
 categoria text not null, descripcion text not null, fecha date not null default (now() at time zone 'America/Guayaquil')::date,
 cuota_id uuid, creado_por uuid not null, token uuid not null,
 unique(tenant_id,id), unique(tenant_id,token),
 foreign key(tenant_id,cuota_id) references public.cuotas(tenant_id,id),
 foreign key(tenant_id,creado_por) references public.usuarios_perfiles(tenant_id,id)
);
create table public.cierres_caja (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.empresas(id), fecha date not null,
 efectivo_sistema numeric(14,2) not null, efectivo_fisico numeric(14,2) not null check(efectivo_fisico>=0),
 diferencia numeric(14,2) generated always as (efectivo_fisico-efectivo_sistema) stored,
 estado text generated always as (case when efectivo_fisico=efectivo_sistema then 'cuadrado' else 'descuadre' end) stored,
 retroactivo boolean not null, creado_por uuid not null, creado_en timestamptz not null default now(),
 unique(tenant_id,id), unique(tenant_id,fecha), foreign key(tenant_id,creado_por) references public.usuarios_perfiles(tenant_id,id)
);
-- RLS busca primero tenant_id; índices en cada tabla y en relaciones frecuentes.
do $$declare t text;begin foreach t in array array['usuarios_perfiles','clientes','proveedores','catalogo_maquinaria','contratos_alquiler','contratos_detalles','facturas_sri','factura_detalles','notas_credito','cuotas','plantillas_gastos','cuentas_por_pagar','movimientos_caja','cierres_caja'] loop
 execute format('create index on public.%I(tenant_id)',t);end loop;end$$;
create index on public.contratos_detalles(tenant_id,equipo_id);
create index on public.facturas_sri(estado,creado_en) where estado in ('Pendiente','Procesando');
-- NUMERIC acepta NaN: excluirlo también en INSERT directo por REST.
do $$declare c record;begin
 for c in select a.table_name,a.column_name from information_schema.columns a join information_schema.tables t on t.table_schema=a.table_schema and t.table_name=a.table_name
 where a.table_schema='public' and a.data_type='numeric' and t.table_type='BASE TABLE' loop
 execute format('alter table public.%I add constraint %I check(%I is null or %I::text not in(''NaN'',''Infinity'',''-Infinity''))',c.table_name,'finite_'||c.column_name,c.column_name,c.column_name);
 end loop;end$$;
