// Inicialización del SDK de servidor de Paddle (@paddle/paddle-node-sdk,
// build edge con Web Crypto — apto para Deno Edge Functions).
//
// Reglas del proyecto, aquí centralizadas:
//   - El entorno NUNCA se asume: PADDLE_ENVIRONMENT debe decir "sandbox"
//     o "production"; si falta o es otra cosa, la function se niega en voz
//     alta (503) en lugar de operar contra la cuenta equivocada.
//   - La API key (pdl_sdbx_… / pdl_live_…) vive sólo en el servidor y debe
//     corresponder al entorno declarado: una clave sandbox jamás opera en
//     production, ni al revés.
import { Environment, Paddle } from "npm:@paddle/paddle-node-sdk@3.10.0";

export const entornoPaddle = (): Environment => {
  const entorno = Deno.env.get("PADDLE_ENVIRONMENT");
  if (entorno === "sandbox") return Environment.sandbox;
  if (entorno === "production") return Environment.production;
  throw new Error(
    "PADDLE_ENVIRONMENT debe ser 'sandbox' o 'production' (no se asume entorno)",
  );
};

/** Cliente API para paddle-portal: exige PADDLE_API_KEY declarada y
 *  coherente con el entorno. Falla ruidosamente antes de tocar la API. */
export const paddleApi = (): Paddle => {
  const entorno = entornoPaddle();
  const clave = Deno.env.get("PADDLE_API_KEY");
  if (!clave) throw new Error("Falta PADDLE_API_KEY");
  const esSandbox = clave.startsWith("pdl_sdbx_");
  if (entorno === Environment.sandbox && !esSandbox)
    throw new Error("PADDLE_ENVIRONMENT=sandbox exige una clave pdl_sdbx_");
  if (entorno === Environment.production && esSandbox)
    throw new Error("Una clave sandbox no puede operar en production");
  return new Paddle(clave, { environment: entorno });
};

/** Instancia mínima para verificar la firma de los webhooks:
 *  `webhooks.unmarshal` es HMAC-SHA512 puro (Web Crypto) sobre el cuerpo
 *  crudo — no toca la red ni la API, así que no necesita API key ni
 *  entorno. El secreto de firma (por notificación) entra como parámetro. */
export const paddleSoloFirma = (): Paddle =>
  new Paddle("sin-api-key: solo-firma-hmac", {
    environment: Environment.sandbox,
  });
