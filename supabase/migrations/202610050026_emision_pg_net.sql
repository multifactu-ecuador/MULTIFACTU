-- Emisión automática con pg_net: cada INSERT en facturas_sri o notas_credito
-- llama a la función edge correspondiente (sri-procesar / notas-procesar) con
-- el mismo payload y secreto que esperaría el webhook manual del Dashboard.
--
-- Motivo: el webhook del Dashboard es una configuración fuera del repositorio;
-- si no existe o su secreto no coincide, los comprobantes quedan "Pendiente"
-- para siempre. Este trigger vive en el código, se aplica con las migraciones
-- y es verificable con SQL. Si además hubiera un webhook del Dashboard, el
-- segundo aviso queda "omitido": el reclamo Pendiente -> Procesando es
-- atómico, así que nunca se emite dos veces.
--
-- El secreto y la URL base NO están en este archivo: viven cifrados en Vault
-- con el nombre sri_emision_webhook (JSON {"base": "...", "secret": "..."}).
-- Sin esa entrada el trigger no hace nada, así que una base nueva o de
-- pruebas jamás rompe una inserción.

do $$
begin
  -- PGLite (tests locales) no distribuye pg_net: allí este archivo se omite.
  if not exists(select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_net no disponible: sin disparo automático de emisión';
    return;
  end if;

  if not exists(select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net with schema extensions;
  end if;

  create or replace function private.emitir_sri_webhook()
  returns trigger language plpgsql security definer set search_path='' as $fn$
  declare cfg jsonb; destino text;
  begin
    select decrypted_secret into cfg
      from vault.decrypted_secrets where name = 'sri_emision_webhook';
    if cfg is null
       or coalesce(cfg->>'base','') = ''
       or coalesce(cfg->>'secret','') = '' then
      return new;
    end if;
    destino := (cfg->>'base') || '/functions/v1/' ||
      case when tg_table_name = 'notas_credito' then 'notas-procesar'
           else 'sri-procesar' end;
    perform net.http_post(
      url := destino,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', cfg->>'secret'),
      body := jsonb_build_object(
        'type', 'INSERT', 'schema', 'public', 'table', tg_table_name,
        'record', jsonb_build_object('id', new.id, 'tenant_id', new.tenant_id),
        'old_record', null::jsonb),
      timeout_milliseconds := 10000);
    return new;
  exception when others then
    -- Nunca se aborta el INSERT del negocio por un fallo del webhook.
    raise warning 'emisión automática fallida (%): %', tg_table_name, sqlerrm;
    return new;
  end $fn$;

  revoke all on function private.emitir_sri_webhook()
    from public, anon, authenticated;

  drop trigger if exists emision_sri on public.facturas_sri;
  create trigger emision_sri
    after insert on public.facturas_sri
    for each row execute function private.emitir_sri_webhook();

  drop trigger if exists emision_nota_sri on public.notas_credito;
  create trigger emision_nota_sri
    after insert on public.notas_credito
    for each row execute function private.emitir_sri_webhook();
end $$;
