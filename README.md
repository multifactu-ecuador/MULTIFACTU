# MULTIFACTU · React + Supabase

Versión de desarrollo multiempresa. Frontend React/TypeScript/Tailwind; backend PostgreSQL, Auth, Storage y Edge Functions Deno. Sin servidor Node.js, ORM ni Redis. Node se usa únicamente para compilar y ejecutar pruebas.

## Iniciar la web

Requiere Node 22 o superior. Descomprime el ZIP y abre la carpeta que contiene **este package.json** (no una carpeta superior).

```powershell
npm ci
Copy-Item client/.env.example client/.env
# Edita client/.env con la URL y clave pública de TU proyecto Supabase.
npm run dev
```

Abre http://localhost:5173. Sin credenciales puedes ver portada, planes y formularios; el registro y login reales permanecen deshabilitados. `npm run build` compila el frontend. Nunca pongas una clave service_role en VITE_*.

## Preparar Supabase

1. Crea un proyecto. En Authentication habilita Email y define Site URL `http://localhost:5173` y las URL de redirección autorizadas. En producción usa el dominio HTTPS real. Mantén confirmación de correo habilitada.
2. Ejecuta **en orden**, una sola vez, todas las migraciones de `supabase/migrations/` en SQL Editor. Alternativa con CLI Supabase: vincula el proyecto y ejecuta `supabase db push`.
3. Configura la contraseña mínima de Auth a 12 caracteres. Completa `client/.env` con Project URL y la clave publishable/anon pública.
4. Guarda los secretos de Edge Functions con CLI Supabase. Usa `supabase/functions/.env.example` como guía; sustituye el secreto del webhook por un valor aleatorio largo. No subas el archivo de secretos a git. Supabase proporciona sus variables internas URL/service_role.
5. Despliega `supabase functions deploy sri-procesar --no-verify-jwt`, `supabase functions deploy planes-pago --no-verify-jwt`, `supabase functions deploy generar-ride --no-verify-jwt` y `supabase functions deploy consultar-ruc --no-verify-jwt`. Los handlers verifican su autenticación internamente.
6. Configura el webhook descrito en `docs/arquitectura.md`. Crea una cuenta desde `/registro`. El trigger crea empresa, administrador, cliente consumidor final y prueba Luxury.
7. Para el autocompletado fiscal de empresa, configura los secretos y el proveedor descritos en [`docs/CONFIGURAR_API_RUC.md`](docs/CONFIGURAR_API_RUC.md).

## Planes y prueba

| Plan    | Precio mensual sin IVA | Permisos                                                |
| ------- | ---------------------: | ------------------------------------------------------- |
| Inicial |                  $6,99 | Facturas demo, catálogo, productos, servicios, clientes |
| Pro     |                 $11,99 | Inicial + alquiler, fechas, reservas y garantías        |
| Luxury  |                 $18,99 | Pro + caja, cobros, gastos y acceso financiero          |

Los nuevos negocios reciben Luxury durante **604800 segundos**, desde el alta en Auth, aunque la confirmación de correo esté pendiente. Después se bloquean las operaciones. Login, datos del perfil de acceso y compra de plan siguen disponibles. PostgreSQL usa su propio reloj y no acepta cambios de plan desde el navegador. Una cédula y su RUC natural asociado comparten identidad para impedir dos pruebas con esos formatos.

Los precios comerciales incluyen proformas, cuentas por pagar y análisis avanzado como alcance del producto final: consulta abajo qué está implementado y qué falta en esta base. No publiques funciones pendientes como ya operativas.

## Qué funciona en esta entrega

- Portada MULTIFACTU con tus logos originales, registro con nombre/empresa/cédula o RUC/email/contraseña y condiciones propias de ejemplo.
- AuthContext, recuperación de sesión, rutas privadas, candados por plan y permisos ADMIN/CAJERO; RLS y privilegios complementarios en la base de datos.
- CRUD de clientes y catálogo; precios y tarifas calculados otra vez en PostgreSQL; stock descontado una vez y secuenciales atómicos.
- Alquiler con disponibilidad por intervalo, días de 24 horas redondeados hacia arriba y garantía fuera de la factura.
- XML de factura, clave módulo 11 y flujo de recepción/autorización **simulados**, modal y descarga del XML demo. La simulación nunca usa el certificado ni llama al SRI real.
- Finanzas: gráfico de métodos de cobro, abonos parciales, gastos, cuotas vencidas, cierres diarios y plantillas de recordatorio (sin pagos automáticos).
- Perfil editable y subida privada de logo/certificado; la contraseña del .p12 se cifra en Supabase Vault y sólo el backend la descifra al firmar. El logo de la empresa todavía no se incrusta en un RIDE o contrato PDF.
- Pedidos de planes con suscripción automática de PayPal. En modo demo no cobra ni activa suscripciones; en modo real la confirmación revalida identificador, plan, referencia, importe y estado contra la API de PayPal antes de activar, y el webhook autorizado añade cada renovación cobrada exactamente una vez.

## Qué falta para venderlo como sistema completo

Firma XAdES-BES real en Deno, extracción segura de .p12 y caducidad/contraseña; validación con XSD oficial; SOAP real, sondeo, rechazos y contingencias; RIDE y contratos PDF; notas de crédito emisibles desde Comprobantes (documento 04); proformas; pago de cuentas a proveedores; análisis de rentabilidad; facturación programada e IA; importaciones/Excel; recordatorios/email/WhatsApp; devoluciones y cierre definitivo de alquiler; recibos internos; sucursales y varias cajas; invitaciones de empleados; recuperación de contraseña y conciliación de pagos si el comprador no vuelve a la web; auditoría, monitoreo y copias/restauración verificadas.

Un recibo interno no debe presentarse como sustituto de un comprobante tributario obligatorio. Esta entrega no acredita cumplimiento del SRI 2026 ni respaldo oficial del SRI o de un proveedor de firma.

En esta fase cada negocio tiene una caja, sin fondo de apertura. El stock se reserva/descuenta al crear la operación, antes del resultado simulado; antes de producción debe completarse el flujo de cancelación y devolución de inventario. Los términos son un borrador: completa identidad del prestador y condiciones antes de publicar.

## Comprobaciones

```bash
npm run build
npm test
npm run test:sql
npm run check:edge
```

`test:sql` ejecuta las migraciones en PostgreSQL WASM (PGlite) con esquemas Auth/Storage de prueba, no en tu proyecto remoto. Comprueba aislamiento, trigger, restricciones de planes, expiración, stock, abonos y pagos idempotentes. `check:edge` comprueba tipos Deno; no despliega ni consume servicios reales.

## Estructura

- `client/src/auth`: contexto y protección.
- `client/src/pages`: comercial, registro/login y módulos de negocio.
- `shared`: cédula/RUC orientativo, cálculos y clave de acceso.
- `supabase/migrations`: SQL nativo, relaciones compuestas, RLS, operaciones transaccionales y Storage.
- `supabase/functions`: webhook SRI demo y pedidos de planes.
- `tests`: comprobaciones fiscales y PostgreSQL.
- `docs/arquitectura.md`: seguridad, webhook y límites operativos.
