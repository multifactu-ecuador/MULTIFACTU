// Detección server-side del país del visitante, para precios localizados de
// Paddle. Vercel inyecta la cabecera `x-vercel-ip-country` en cada request.
//
// - Si la cabecera existe, devolvemos el código ISO alfanumérico de 2 letras.
// - Si NO existe (p. ej. entorno local sin la función), devolvemos
//   { country: null } y el cliente NO envía país a Paddle:
//   Paddle.PricePreview() infiere la ubicación desde la IP del visitante.
//
// Este endpoint no lleva ni lee credenciales: sólo una cabecera del request.
// El "sentinela" de país (si existe en la app) es asunto del cliente; jamás
// se pasa a Paddle como country code.

interface Peticion {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface Respuesta {
  status(codigo: number): Respuesta;
  setHeader(clave: string, valor: string): void;
  json(cuerpo: unknown): void;
}

export default function handler(peticion: Peticion, respuesta: Respuesta) {
  if (peticion.method !== "GET") {
    respuesta.status(405).json({ error: "Método no permitido" });
    return;
  }

  const bruto = peticion.headers["x-vercel-ip-country"];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  const country =
    typeof valor === "string" && /^[A-Za-z]{2}$/.test(valor)
      ? valor.toUpperCase()
      : null;

  respuesta.setHeader("Cache-Control", "no-store");
  respuesta.status(200).json({ country });
}
