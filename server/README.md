# Servicio fiscal privado

Este directorio es un backend **Node.js**, separado del cliente y de las
Supabase Edge Functions. Es el único entorno que puede leer `ENCRYPTION_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` y material de firmas electrónicas. No expongas
ninguna de estas variables con prefijo `VITE_`.

## Configuración

1. Copia `server/.env.example` a `server/.env` en el host privado y genera una
   clave nueva de 32 bytes para `ENCRYPTION_KEY` (base64 o hexadecimal).
2. Ejecuta la migración `202610040013_emisor_firmas.sql`.
3. Inicializa un cliente Supabase de servidor con el `service role key`:

```ts
import { createClient } from "@supabase/supabase-js";

export const fiscalDb = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
```

## Onboarding de la firma

La ruta de tu framework debe autenticar el usuario, obtener `tenantId`, `userId`,
RUC y rol **desde la sesión del servidor**, y después delegar en
`uploadFiscalSignature`. La ruta recibe `multipart/form-data` con `p12` y
`password`; el archivo se valida, se cifra con AES-256-GCM y se borra del
buffer en memoria antes de responder.

```ts
import { uploadFiscalSignature } from "./src/routes/fiscalSignatureRoute.ts";

// Ejemplo conceptual de un handler Fetch/Next/Hono.
const response = await uploadFiscalSignature(request, sessionContext, fiscalDb);
```

## Procesamiento de una factura real

Después de reclamar una factura de forma atómica y guardar `xml_borrador`, el
worker interno llama al firmador. El worker no recibe certificados ni
contraseñas: `firmarBorradorFacturaParaTenant` los descifra solo durante la
firma y guarda `xml_firmado` bajo el mismo `tenant_id` y `claim_token`.

```ts
import { procesarFirmaFiscal } from "./src/routes/fiscalInvoiceProcessor.ts";

const signature = await procesarFirmaFiscal(
  { tenantId, invoiceId, claimToken }, // valores del trabajo interno, no del navegador
  fiscalDb,
);
// Leer xml_firmado con tenant_id + claim_token y enviarlo al SOAP de recepción SRI.
```

Si el worker está en otro proceso, monta `firmarFacturaInterna` en una ruta
privada y protégela detrás de una red privada o una lista de destinos conocida;
el token `FISCAL_SIGNER_INTERNAL_TOKEN` es solo una defensa adicional. No
configures una URL de firmador arbitraria desde variables que un usuario pueda
editar, ni reenvíes el P12 fuera del backend Node.

## Migración desde el flujo heredado

`empresas.p12_password` es una columna heredada en texto plano. El nuevo
servicio no la lee ni la escribe. Una vez que cada empresa haya cargado de
nuevo su firma mediante este flujo cifrado, elimina esa columna mediante una
migración de mantenimiento aprobada; hacerlo antes descartaría contraseñas que
puedan seguir en uso.

La firma se verifica criptográficamente en las pruebas locales, pero antes de
producción debe pasar el ambiente de pruebas del SRI con los XSD y la ficha
técnica vigentes. La documentación oficial de facturación electrónica está en
https://www.sri.gob.ec/facturacion-electronica.
