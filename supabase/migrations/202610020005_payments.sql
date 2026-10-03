create table public.pedidos_planes(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.empresas(id),usuario_id uuid not null,
 plan text not null check(plan in('inicial','pro','luxury')),token uuid not null,client_tx text not null unique,
 base_centavos int not null check(base_centavos>0),iva_centavos int not null check(iva_centavos>=0),
 total_centavos int not null check(total_centavos=base_centavos+iva_centavos),
 modo text not null check(modo in('demo','payphone')),estado text not null default 'PENDIENTE' check(estado in('PENDIENTE','PREPARANDO','PREPARADO','CONSULTAR','PAGADO','CANCELADO','SIMULADO')),
 payment_id text,pay_with_card text,pay_with_payphone text,transaction_id bigint unique,
 aplicado_en timestamptz,creado_en timestamptz not null default now(),
 unique(tenant_id,token),foreign key(tenant_id,usuario_id) references public.usuarios_perfiles(tenant_id,id)
);
alter table public.pedidos_planes enable row level security;
create policy mis_pedidos on public.pedidos_planes for select to authenticated using(tenant_id=private.tenant_id() and private.rol()='ADMIN');
revoke all on public.pedidos_planes from anon,authenticated;
grant select on public.pedidos_planes to authenticated;grant all on public.pedidos_planes to service_role;
-- Sólo Edge/backend confiable llama esta función DESPUÉS de verificar al proveedor.
-- La transición y la activación son una transacción; un mismo pedido nunca añade dos meses.
create function public.confirmar_pago_plan(p_pedido uuid,p_transaction bigint,p_total int,p_moneda text) returns void language plpgsql security definer set search_path='' as $$
declare p public.pedidos_planes; s public.suscripciones; periodo_desde timestamptz;begin
 select * into p from public.pedidos_planes where id=p_pedido for update;
 if not found or p.modo<>'payphone' or p.total_centavos<>p_total or p_moneda<>'USD' or p_transaction<=0 then raise exception 'Pago no coincide';end if;
 if p.aplicado_en is not null then if p.transaction_id<>p_transaction then raise exception 'Transacción distinta';end if;return;end if;
 if p.estado='CANCELADO' then raise exception 'Pedido cancelado';end if;
 select * into s from public.suscripciones where tenant_id=p.tenant_id for update;
 periodo_desde:=case when s.estado='active' and s.plan=p.plan and s.fin>now() then s.fin else now() end;
 update public.suscripciones set estado='active',plan=p.plan,inicio=now(),fin=periodo_desde+interval '1 month' where tenant_id=p.tenant_id;
 update public.pedidos_planes set estado='PAGADO',transaction_id=p_transaction,aplicado_en=now() where id=p.id;
end$$;
revoke all on function public.confirmar_pago_plan(uuid,bigint,int,text) from public,anon,authenticated;
grant execute on function public.confirmar_pago_plan(uuid,bigint,int,text) to service_role;
