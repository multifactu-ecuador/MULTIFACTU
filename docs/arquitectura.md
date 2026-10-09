# Arquitectura y operación de MULTIFACTU

## Aislamiento

React usa únicamente la clave pública Supabase. Auth identifica al usuario; `usuarios_perfiles` relaciona `auth.uid()` con una empresa y rol. `private.tenant_id()` es SECURITY DEFINER con search_path vacío y lectura directa para evitar recursión RLS. La empresa raíz tiene tenant_id igual a su id. Las referencias entre clientes, documentos, equipos y movimientos incluyen tenant_id: no basta conocer el UUID de otra empresa.

RLS filtra por tenant y permisos vigentes de `private.tiene_funcion()`. Las tablas sensibles no tienen escritura directa para authenticated: emitir, abonar y cerrar caja exige RPCs con cálculo servidor. Rol, tenant, suscripción y estado SRI no son campos libremente modificables. El trigger ignora roles o planes enviados en metadata. Los registros nuevos crean su propia empresa; las invitaciones de empleados necesitan otro flujo antes de permitirlas.

AuthContext escucha onAuthStateChange, recupera el perfil, actualiza permisos y considera el tiempo de servidor. Los candados muestran la compra requerida; la base de datos aplica la misma restricción aunque alguien invoque la API directamente. Los administradores vencidos conservan acceso a sus pedidos y configuración de acceso para renovar. No hay política pública de lectura de documentos o certificados.

## Emisión automática (facturas y notas de crédito)

La emisión no depende de una configuración manual fuera del repositorio. La migración `202610050026_emision_pg_net.sql` crea dos triggers con pg_net:

- `emision_sri` sobre `public.facturas_sri` → llama a `sri-procesar`.
- `emision_nota_sri` sobre `public.notas_credito` → llama a `notas-procesar`.

Ambos envían `POST` con `Content-Type: application/json`, la cabecera `x-webhook-secret` y el cuerpo `{type, schema, table, record: {id, tenant_id}, old_record: null}`, que es exactamente lo que las funciones esperan. La URL base y el secreto viven cifrados en Vault con el nombre `sri_emision_webhook` (JSON `{"base": "...", "secret": "..."}`); el secreto coincide con el secreto de entorno `SRI_WEBHOOK_SECRET`. Sin esa entrada el trigger no hace nada, así que una base nueva jamás rompe una inserción.

El trigger es SECURITY DEFINER, corre después del INSERT y captura cualquier excepción: un fallo del webhook nunca aborta el INSERT del negocio. Sólo salta en INSERT; un UPDATE no vuelve a disparar nada.

También puede existir un webhook del Dashboard (Database → Webhooks → INSERT → URL `https://TU-PROYECTO.supabase.co/functions/v1/sri-procesar`, header `x-webhook-secret`), pero es opcional: si avisan los dos, el segundo queda "omitido" porque el reclamo Pendiente → Procesando es atómico. Nunca configures un webhook desde el navegador ni pongas el secreto o service_role en el frontend. El handler valida el evento y vuelve a consultar la factura y sus detalles después del commit, evitando confiar en importes del payload.

Un UPDATE no vuelve a disparar este webhook. La transición condicional Pendiente → Procesando reclama el trabajo con UUID; dos notificaciones no emiten dos veces. Después genera clave/XML, agrega una marca de firma **simulada**, construye dos peticiones SOAP usando un transporte mock (Recepción y Autorización) y guarda Autorizada o Error con `simulacion=true`. El número es `DEMO-...` y no tiene valor tributario. Para ensayar Error usa SRI_SIMULATION_RESULT=error y crea otra operación; no se modifica la preferencia desde una petición del cliente.

No hay worker de recuperación automático: una caída después de reclamar puede dejar Procesando. Antes de emisión real añade outbox duradero en PostgreSQL, recuperación con leases y conciliación SRI por clave antes de reenviar. Conserva trazabilidad de intentos y consulta logs de Edge/pg_net. No reenvíes a ciegas ni generes otra clave ante un timeout.

## Firma y archivos

Buckets privados `certificados`, `documentos`, `logos`. La primera carpeta debe ser el UUID del tenant. Sólo ADMIN con permiso activo sube/modifica certificados y logos; documentos fiscales sólo los escribirá el backend. La contraseña del .p12 se guarda cifrada en Supabase Vault mediante la RPC `guardar_p12_password` (valida rol ADMIN y plan vigente); la columna en texto plano fue eliminada en la migración `202610050015_p12_vault.sql`. Las Edge Functions la descifran con `leer_p12_password`, ejecutable únicamente por `service_role` y protegida además por el claim del JWT. El navegador nunca recibe la contraseña descifrada. Subir un .p12 no activa la emisión real.

## Pagos

PAYMENTS_MODE=demo es el valor seguro inicial: crea pedido pero no cobra ni concede plan. Para cobro real configura PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_MODE (sandbox por defecto; live sólo con credenciales de producción), APP_ORIGIN con el dominio HTTPS autorizado y PLAN_IVA_RATE correspondiente. El backend calcula precios en centavos; el navegador no decide total ni plan activo. El JWT se verifica con Auth y el tenant se deriva del perfil.

El cobro es una suscripción automática de PayPal Subscriptions: `prepare` crea la suscripción recurrente (producto, planes y webhook se registran vía API la primera vez y quedan en pagos_paypal_catalogo por entorno sandbox/live) y devuelve el enlace de aprobación; el comprador aprueba y PayPal redirige a /app/planes?subscription_id=…, donde `confirm` revalida contra la API identificador, plan recurrente, referencia custom_id, importe y estado, activa el primer mes y cancela la suscripción anterior si hubo cambio de plan. Una RPC accesible sólo por service_role aplica el plan y marca el pedido en una sola transacción; repetir la confirmación no añade meses extra. El webhook /pagos-webhook es público pero exige la verificación criptográfica de la transmisión de PayPal antes de escribir: cada renovación cobrada añade un mes deduplicando por id de venta y avanzando `fin` sólo hacia next_billing_time (nunca hacia atrás ni dos veces); los fallos de cobro suspenden la suscripción y la cancelación del comprador corta la renovación sin tocar el período ya pagado.

Antes de cobrar en producción prueba el sandbox completo: aprobación, rechazo, cancelación del comprador, fallo de cobro (evento SUSPENDED), retorno sin sesión y renovación simulada. La aplicación conserva la ruta del pedido al redirigir a login.

## Integridad y permisos

Crear factura usa un token idempotente, precios/tarifas del catálogo y NUMERIC en PostgreSQL. El token con otro payload se rechaza. El alquiler bloquea reservas solapadas bajo un lock transaccional por empresa. Garantía no forma parte de base ni IVA ni total fiscal. Abonos bloquean la cuota y rechazan sobrepagos; cierres serializan los movimientos de la fecha y la cierran. Las plantillas recurrentes son recordatorios, no egresos ya pagados.

Las políticas y GRANT son complementarios. No habilites escritura directa sobre facturas, detalles, cuotas, suscripciones o movimientos para resolver un error de cliente. Nunca uses metadata de usuario como fuente de rol o plan.

## Aprendizaje de RUFO (IA por empresa)

RUFO no reentrena modelos: aprende con **memoria por tenant + datos en vivo +
revisión humana**, aislada por empresa.

- `rufo_memoria`: recuerdos por empresa (perfil declarado y hallazgos
  confirmados). Se inyectan en el prompt del modelo junto a un resumen del mes.
- `rufo_aprendizaje`: hallazgos que propone el motor puro
  `functions/_shared/rufo-learning.ts` (ventas vs. mes anterior, mora, stock
  bajo, caja y concentración de clientes). Ciclo `propuesto → confirmado |
  descartado`; sólo lo confirmado pasa a memoria. Unicidad por
  `(tenant, clave, periodo)` para no duplicar propuestas.
- `rufo_feedback`: valoración 👍/👎 de cada respuesta.
- `rufo_control`: última corrida del análisis (máximo una vez por semana,
  perezoso, al primer preguntar; nunca frena la respuesta).

RLS: el navegador sólo **lee** (rol ADMIN del propio tenant); toda escritura es
del service role mediante las acciones de `asistente` (`estado`, `revisar`,
`olvidar`, `perfil`, `feedback`). RUFO sigue siendo de sólo lectura: propone
opciones con cifras y **no decide ni ejecuta** nada.

## Referencias oficiales de implementación

- Auth y trigger: https://supabase.com/docs/guides/auth/managing-user-data
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Webhooks: https://supabase.com/docs/guides/database/webhooks
- Seguridad Storage: https://supabase.com/docs/guides/storage/security/access-control
- Edge Auth: https://supabase.com/docs/guides/functions/auth
- PayPal Subscriptions: https://developer.paypal.com/docs/api/subscriptions/v1/
