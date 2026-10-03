# Arquitectura y operación de MULTIFACTU

## Aislamiento

React usa únicamente la clave pública Supabase. Auth identifica al usuario; `usuarios_perfiles` relaciona `auth.uid()` con una empresa y rol. `private.tenant_id()` es SECURITY DEFINER con search_path vacío y lectura directa para evitar recursión RLS. La empresa raíz tiene tenant_id igual a su id. Las referencias entre clientes, documentos, equipos y movimientos incluyen tenant_id: no basta conocer el UUID de otra empresa.

RLS filtra por tenant y permisos vigentes de `private.tiene_funcion()`. Las tablas sensibles no tienen escritura directa para authenticated: emitir, abonar y cerrar caja exige RPCs con cálculo servidor. Rol, tenant, suscripción y estado SRI no son campos libremente modificables. El trigger ignora roles o planes enviados en metadata. Los registros nuevos crean su propia empresa; las invitaciones de empleados necesitan otro flujo antes de permitirlas.

AuthContext escucha onAuthStateChange, recupera el perfil, actualiza permisos y considera el tiempo de servidor. Los candados muestran la compra requerida; la base de datos aplica la misma restricción aunque alguien invoque la API directamente. Los administradores vencidos conservan acceso a sus pedidos y configuración de acceso para renovar. No hay política pública de lectura de documentos o certificados.

## Webhook de facturas

En el Dashboard Supabase abre Database → Webhooks → Create webhook:

- Nombre: `multifactu-factura-insert`.
- Tabla: `public.facturas_sri`.
- Evento: **INSERT** exclusivamente.
- Tipo: HTTP Request, método POST.
- URL: `https://TU-PROYECTO.supabase.co/functions/v1/sri-procesar`.
- Headers: `Content-Type: application/json` y `x-webhook-secret: TU_SECRETO_LARGO`.
- Timeout: configura el permitido por el Dashboard y revisa las ejecuciones en los logs.

El secreto debe coincidir con SRI_WEBHOOK_SECRET de la función. Nunca configures este webhook desde el navegador ni pongas el secreto o service_role en el frontend. Supabase entrega `{type, schema, table, record, old_record}`; el handler valida el evento y vuelve a consultar la factura y sus detalles después del commit, evitando confiar en importes del payload.

Un UPDATE no vuelve a disparar este webhook. La transición condicional Pendiente → Procesando reclama el trabajo con UUID; dos notificaciones no emiten dos veces. Después genera clave/XML, agrega una marca de firma **simulada**, construye dos peticiones SOAP usando un transporte mock (Recepción y Autorización) y guarda Autorizada o Error con `simulacion=true`. El número es `DEMO-...` y no tiene valor tributario. Para ensayar Error usa SRI_SIMULATION_RESULT=error y crea otra operación; no se modifica la preferencia desde una petición del cliente.

No hay worker de recuperación automático: una caída después de reclamar puede dejar Procesando. Antes de emisión real añade outbox duradero en PostgreSQL, recuperación con leases y conciliación SRI por clave antes de reenviar. Conserva trazabilidad de intentos y consulta logs de Edge/pg_net. No reenvíes a ciegas ni generes otra clave ante un timeout.

## Firma y archivos

Buckets privados `certificados`, `documentos`, `logos`. La primera carpeta debe ser el UUID del tenant. Sólo ADMIN con permiso activo sube/modifica certificados y logos; documentos fiscales sólo los escribirá el backend. No se captura contraseña .p12 en esta demo. Para firma real hay que diseñar manejo de secretos independiente del perfil y de la base pública, validar el certificado, firmar en memoria y verificar el XML resultante. Subir un .p12 no activa la emisión real.

## Pagos

PAYMENTS_MODE=demo es el valor seguro inicial: crea pedido pero no cobra ni concede plan. Para modo payphone configura PAYPHONE_TOKEN, PAYPHONE_STORE_ID, APP_ORIGIN con el dominio HTTPS autorizado y PLAN_IVA_RATE correspondiente. El backend calcula precios en centavos; el navegador no decide total ni plan activo. El JWT se verifica con Auth y el tenant se deriva del perfil.

Al volver de PayPhone se confirma la transacción con V2/Confirm, comprobando referencia, total, moneda y aprobación. Una RPC accesible sólo por service_role aplica el plan y marca el pedido en una sola transacción. Repetir la confirmación no añade meses extra. El mismo plan activo renueva desde su fin; cambiar plan reemplaza por un mes sin prorrateo. No hay cobros automáticos.

La confirmación depende actualmente del retorno del comprador autenticado. PayPhone documenta un plazo de confirmación: completa conciliación y recuperación antes de cobrar en producción. Prueba con credenciales reales autorizadas, rechazo, cancelación, timeout y retorno sin sesión. La aplicación conserva la ruta del pedido al redirigir a login.

## Integridad y permisos

Crear factura usa un token idempotente, precios/tarifas del catálogo y NUMERIC en PostgreSQL. El token con otro payload se rechaza. El alquiler bloquea reservas solapadas bajo un lock transaccional por empresa. Garantía no forma parte de base ni IVA ni total fiscal. Abonos bloquean la cuota y rechazan sobrepagos; cierres serializan los movimientos de la fecha y la cierran. Las plantillas recurrentes son recordatorios, no egresos ya pagados.

Las políticas y GRANT son complementarios. No habilites escritura directa sobre facturas, detalles, cuotas, suscripciones o movimientos para resolver un error de cliente. Nunca uses metadata de usuario como fuente de rol o plan.

## Referencias oficiales de implementación

- Auth y trigger: https://supabase.com/docs/guides/auth/managing-user-data
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Webhooks: https://supabase.com/docs/guides/database/webhooks
- Seguridad Storage: https://supabase.com/docs/guides/storage/security/access-control
- Edge Auth: https://supabase.com/docs/guides/functions/auth
- PayPhone: https://docs.payphone.app/boton-de-pago
