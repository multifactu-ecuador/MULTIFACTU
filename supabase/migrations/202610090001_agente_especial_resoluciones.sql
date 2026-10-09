-- Anexo 21 (agente de retención) y "contribuyente especial" de la Ficha
-- Técnica SRI v2.34: el comprobante electrónico debe incluir
-- <agenteRetencion> con el número de resolución omitiendo ceros a la
-- izquierda (máx. 8 dígitos) y <contribuyenteEspecial> con la resolución
-- (3 a 13 caracteres alfanuméricos) cuando el contribuyente esté designado.
--
-- El lookup de consultar-ruc ya detecta ambas condiciones pero no existía
-- dónde guardar el número; hasta ahora el XML simplemente no podía emitir
-- estas etiquetas. Los check replican exactamente la regla que después
-- aplica sri.ts antes de insertar el nodo: cadena vacía o con formato
-- inválido no se guarda (y por lo tanto nunca se envía al SRI).
alter table public.empresas
  add column if not exists agente_retencion text
    check (agente_retencion is null or agente_retencion ~ '^[1-9][0-9]{0,7}$'),
  add column if not exists contribuyente_especial text
    check (contribuyente_especial is null or contribuyente_especial ~ '^[0-9A-Za-z]{3,13}$');

comment on column public.empresas.agente_retencion is
  'N° de resolución de agente de retención sin ceros a la izquierda (Anexo 21, Ficha Técnica 2.34). Null si el contribuyente no es agente.';
comment on column public.empresas.contribuyente_especial is
  'N° de resolución de contribuyente especial, 3-13 alfanuméricos. Null si no aplica.';

-- Misma pauta que el resto de columnas editables desde Perfil: el ADMIN de
-- cada empresa guarda sus propios datos (grant a nivel de columna).
grant update(agente_retencion, contribuyente_especial)
  on public.empresas to authenticated;
