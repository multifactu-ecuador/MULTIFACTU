// ¿Una suscripción de Paddle otorga acceso de pago hoy? (ayuda pura, sin
// dependencias, testeable en Node como guard.ts).
//
// Reglas (denegar por defecto), idénticas a private.paddle_acceso en SQL:
//   - active / trialing → sí (vigente o en la prueba gratuita de 7 días).
//   - past_due → sí: Paddle reintenta el cobro (dunning) y cortar el
//     acceso de golpe castigaría a quien ya va a pagar; la interfaz avisa.
//   - paused / canceled → no.
//   - Estado desconocido → no.
//
// Un cambio programado (scheduledChange de cancel/pause con effective_at
// futuro) NO revoca nada: la suscripción sigue 'active' hasta que Paddle
// envía el evento que la deja realmente 'canceled'. Por eso esta ayuda sólo
// mira `estado` y jamás el cambio programado.
export interface EstadoSuscripcionPaddle {
  estado: string;
}

export function otorgaAcceso(
  suscripcion: EstadoSuscripcionPaddle | null | undefined,
): boolean {
  if (!suscripcion) return false;
  return (
    suscripcion.estado === "active" ||
    suscripcion.estado === "trialing" ||
    suscripcion.estado === "past_due"
  );
}
