-- Firma electrónica cifrada por empresa. Los valores ciphertext/iv/tag se
-- generan en el backend Node con AES-256-GCM; PostgreSQL nunca recibe el P12
-- ni la contraseña en texto plano.
create table public.emisor_firmas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.empresas(id) on delete cascade,
  ruc_certificado text not null check (ruc_certificado ~ '^([0-9]{10}|[0-9]{13})$'),
  certificate_ciphertext text not null,
  certificate_iv text not null,
  certificate_tag text not null,
  password_ciphertext text not null,
  password_iv text not null,
  password_tag text not null,
  key_version smallint not null default 1 check (key_version > 0),
  certificate_fingerprint text not null check (certificate_fingerprint ~ '^[a-f0-9]{64}$'),
  issuer text not null,
  serial_number text not null,
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > valid_from)
);

create index emisor_firmas_expiry_idx on public.emisor_firmas(expires_at);
alter table public.emisor_firmas enable row level security;

-- This table is intentionally inaccessible through anon/authenticated clients.
-- The private Node service uses a service-role client only after authenticating
-- the caller and resolving its tenant server-side.
revoke all on table public.emisor_firmas from anon, authenticated;
grant select, insert, update, delete on table public.emisor_firmas to service_role;

create or replace function private.actualizar_emisor_firma_timestamp()
returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger emisor_firmas_actualizado
before update on public.emisor_firmas
for each row execute function private.actualizar_emisor_firma_timestamp();

-- Legacy migration note: `public.empresas.p12_password` remains untouched to
-- avoid destructive data loss. Do not read or write it. After every issuer has
-- re-uploaded through this encrypted flow, remove that plaintext column in a
-- separately approved maintenance migration.
