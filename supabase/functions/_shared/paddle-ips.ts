// Allowlist de ORIGEN para las entregas del webhook de Paddle.
//
// La autenticación REAL del webhook es la firma HMAC del SDK (unmarshal en
// paddle-webhook/index.ts); esta capa es endurecimiento adicional: sólo se
// procesan entregas cuya IP de origen está en la lista que Paddle publica
// en https://api.paddle.com/ips (fuente de verdad; la lista JAMÁS se
// hardcodea aquí porque Paddle puede cambiarla — se descarga con caché de
// 1 hora y se revalida sola).
//
// Supabase Edge no expone la IP del cliente por connInfo (devuelve IPs
// internas del runtime); la señal usable es x-forwarded-for, que el
// gateway pone en cada petición (mismo patrón que el example oficial
// "location" de Supabase). Sin esa cabecera no hay forma de verificar el
// origen → se DENIEGA (ante cualquier no-2xx, Paddle reintenta).
//
// Módulo SIN dependencias (doctrina de guard.ts): se testea en Node con
// node --test (tests/paddle-ips.test.ts).
export const URL_IPS_PADDLE = "https://api.paddle.com/ips";

/** Vigencia de la caché en memoria: revalidar cada hora es una llamada
 *  pública barata y mantiene la lista fresca sin ir por entrega. */
const TTL_MS = 60 * 60 * 1000;

/** IPv4 "a.b.c.d" → entero sin signo; null si no parsea (IPv6 real,
 *  basura, números fuera de rango). */
export function ipv4AEntero(ip: string): number | null {
  const partes = ip.trim().split(".");
  if (partes.length !== 4) return null;
  let entero = 0;
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    entero = (entero * 256 + n) >>> 0;
  }
  return entero;
}

/** Normaliza lo que el runtime declare como origen: prefijo v4-mapeada
 *  ::ffff: y espacios. Devuelve "" si no queda nada utilizable. */
export function normalizarIp(ip: string): string {
  return ip.trim().replace(/^::ffff:/i, "");
}

/** ¿La IP cae dentro de alguno de los CIDR (soporta /0–/32; las listas
 *  actuales de Paddle son /32)? Denegar por defecto: IP no parseable o
 *  lista inútil → false. */
export function ipPermitida(ip: string, cidrs: string[]): boolean {
  const destino = ipv4AEntero(normalizarIp(ip));
  if (destino === null) return false;
  for (const cidr of cidrs) {
    const [redTexto, bitsTexto] = cidr.trim().split("/");
    const red = ipv4AEntero(redTexto);
    if (red === null) continue;
    const bits = bitsTexto === undefined ? 32 : Number(bitsTexto);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if (((destino & mascara) >>> 0) === ((red & mascara) >>> 0)) return true;
  }
  return false;
}

let cache: { cidrs: string[]; en: number } | null = null;
let vuelo: Promise<string[] | null> | null = null;

/** Lista vigente de CIDRs de Paddle. Con error de red devuelve la caché
 *  vencida si existe (una lista vieja sigue siendo la verdad de Paddle;
 *  mejor eso que cortar entregas legítimas) y null SÓLO si nunca se cargó:
 *  el llamador responde no-2xx y Paddle reintenta. Nunca se acepta una
 *  entrega "sin lista". Las peticiones concurrentes comparten un vuelo. */
export async function ipsPaddle(): Promise<string[] | null> {
  if (cache && Date.now() - cache.en < TTL_MS) return cache.cidrs;
  if (vuelo) return vuelo;
  vuelo = (async () => {
    try {
      const r = await fetch(URL_IPS_PADDLE);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const cuerpo = (await r.json()) as { data?: { ipv4_cidrs?: unknown } };
      const lista = Array.isArray(cuerpo.data?.ipv4_cidrs)
        ? cuerpo.data.ipv4_cidrs.filter(
            (x): x is string => typeof x === "string",
          )
        : [];
      if (lista.length === 0) throw new Error("sin ipv4_cidrs");
      cache = { cidrs: lista, en: Date.now() };
      return lista;
    } catch (e) {
      console.error("paddle-ips:", e);
      return cache ? cache.cidrs : null;
    } finally {
      vuelo = null;
    }
  })();
  return vuelo;
}

/** Reinicia la caché en memoria (sólo para tests). */
export function reiniciarCacheIps(): void {
  cache = null;
  vuelo = null;
}
