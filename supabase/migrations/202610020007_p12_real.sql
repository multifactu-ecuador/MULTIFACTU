-- Modo real SRI: contraseña del .p12 por empresa (cifrar con pgcrypto en hardening final).
alter table public.empresas add column if not exists p12_password text;
grant update(p12_password) on public.empresas to authenticated;
