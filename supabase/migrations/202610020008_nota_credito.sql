-- Nota de crédito: columnas para emitir como factura (codDoc 04) + RPC de creación.
alter table public.notas_credito
  add column if not exists ambiente_sri text not null default 'pruebas'
    check(ambiente_sri in ('pruebas','produccion')),
  add column if not exists establecimiento text not null default '001'
    check(establecimiento ~ '^[0-9]{3}$' and establecimiento<>'000'),
  add column if not exists punto_emision text not null default '001'
    check(punto_emision ~ '^[0-9]{3}$' and punto_emision<>'000'),
  add column if not exists secuencial bigint,
  add column if not exists xml_borrador text,
  add column if not exists claim_token uuid,
  add column if not exists procesamiento_en timestamptz,
  add column if not exists token uuid,
  add column if not exists mensaje text,
  add constraint notas_credito_secuencial_check check(secuencial between 1 and 999999999);

create or replace function public.crear_nota_credito(p_factura uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=(select private.tenant_id()); f public.facturas_sri%rowtype;
 n uuid:=gen_random_uuid(); num bigint; motivo text:=trim(coalesce(p_motivo,''));
 seq public.secuenciales_sri%rowtype;begin
 if motivo='' or length(motivo)>500 then raise exception 'Motivo requerido';end if;
 select * into f from public.facturas_sri where tenant_id=t and id=p_factura and estado='Autorizada';
 if not found then raise exception 'Solo facturas autorizadas pueden creditarse';end if;
 if exists(select 1 from public.notas_credito where tenant_id=t and factura_id=p_factura and estado in ('Pendiente','Procesando','Autorizada')) then
  raise exception 'Ya existe una nota de crédito activa para esta factura';end if;
 insert into public.secuenciales_sri(tenant_id,ambiente,establecimiento,punto_emision,tipo,ultimo)
 values(t,f.ambiente_sri,f.establecimiento,f.punto_emision,'04',1)
 on conflict(tenant_id,ambiente,establecimiento,punto_emision,tipo) do update set ultimo=public.secuenciales_sri.ultimo+1
 returning ultimo into num;
 insert into public.notas_credito(id,tenant_id,factura_id,ambiente_sri,establecimiento,punto_emision,secuencial,motivo,simulacion,
  subtotal_0,subtotal_5,subtotal_15,iva_5,iva_15,total)
 values(n,t,p_factura,f.ambiente_sri,f.establecimiento,f.punto_emision,num,motivo,true,
  f.subtotal_0,f.subtotal_5,f.subtotal_15,f.iva_5,f.iva_15,f.total);
 return n;
end$$;
revoke all on function public.crear_nota_credito(uuid,text) from public,anon;
grant execute on function public.crear_nota_credito(uuid,text) to authenticated;
alter table public.notas_credito enable row level security;
