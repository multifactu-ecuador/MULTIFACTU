// Orígenes permitidos por APP_ORIGIN, que admite VARIOS separados por coma
// durante la transición de dominio (hoy: https://multifactuec.lat y el
// https://multifactu.vercel.app heredado, que sigue sirviendo hasta que el
// DNS del dominio propio apunte y se redirija).
//
// El navegador exige que Access-Control-Allow-Origin coincida con SU
// origen, así que la cabecera es eco del Origin recibido cuando está en la
// lista; sin Origin (preflight sin credenciales, llamada servidor→servidor)
// se responde con el primero de la lista (el primario).
export function listaOrigenes(): string[] {
  return (Deno.env.get("APP_ORIGIN") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Cabecera ACAO correcta para ESTA petición. */
export function acaoDe(req: Request): string {
  const permitidos = listaOrigenes();
  const dado = req.headers.get("origin")?.replace(/\/$/, "");
  return (
    (dado && permitidos.includes(dado) ? dado : permitidos[0]) ??
    "http://localhost:5173"
  );
}
