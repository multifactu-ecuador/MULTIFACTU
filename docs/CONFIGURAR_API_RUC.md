# Consulta fiscal de RUC

MULTIFACTU incluye la Edge Function privada `consultar-ruc`. El navegador no
recibe la clave del proveedor: solo envía un RUC de trece dígitos a la función,
que valida la sesión y el rol de administrador antes de hacer la consulta.

## Variables de entorno en Supabase

Configura estos secretos en el proyecto de Supabase antes de desplegar la
función:

```text
APP_ORIGIN=https://multifactuec.lat
RUC_LOOKUP_API_URL=https://api.proveedor.ec/contribuyentes/{ruc}
RUC_LOOKUP_API_TOKEN=secreto-del-proveedor
```

`RUC_LOOKUP_API_URL` debe usar HTTPS. Si contiene `{ruc}`, MULTIFACTU lo
reemplaza de forma segura. Si no lo contiene, agrega el parámetro `ruc` a la
consulta. Para otro nombre de parámetro define, por ejemplo:

```text
RUC_LOOKUP_API_RUC_PARAM=numeroRuc
```

La autenticación predeterminada es `Authorization: Bearer <token>`. Si tu
proveedor usa una API key, configura el nombre del encabezado y deja el prefijo
vacío:

```text
RUC_LOOKUP_API_TOKEN_HEADER=x-api-key
RUC_LOOKUP_API_TOKEN_PREFIX=
```

No uses `VITE_RUC_LOOKUP_API_TOKEN` ni publiques estos valores en GitHub,
Vercel o el navegador.

## Despliegue

Después de configurar los secretos, despliega la función `consultar-ruc` en el
proyecto Supabase que usa la aplicación. La configuración en `supabase/config.toml`
indica que la función valida internamente la sesión y por ello no usa la
verificación JWT automática.

## Funcionamiento en la aplicación

En **Perfil de mi empresa**, el administrador ingresa el RUC y selecciona
**Consultar RUC**. Si el contribuyente está activo, la aplicación propone razón
social, nombre comercial, dirección, establecimiento matriz, régimen y
obligación contable. El usuario debe revisar y pulsar **Guardar información**;
la consulta no modifica la empresa por sí sola.

La respuesta se valida para que el RUC devuelto sea exactamente el consultado.
Representantes legales y otros datos no necesarios no se devuelven ni guardan.
La API del proveedor es una fuente de consulta: la autorización de comprobantes
electrónicos continúa dependiendo del SRI.
