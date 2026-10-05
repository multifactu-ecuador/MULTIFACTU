import type { Plan } from "./types";

/** Cuota informativa de almacenamiento por plan (MB). En esta fase sólo se
 *  muestra en la UI; la única cuota impuesta en el servidor es el límite de
 *  10 facturas del periodo de prueba. */
export const LIMITE_ALMACENAMIENTO_MB: Record<Plan, number> = {
  inicial: 256,
  pro: 1024,
  luxury: 5124,
};

/** Comprobantes permitidos al mes según el plan (null = ilimitado). */
export const COMPROBANTES_MES: Record<Plan, number | null> = {
  inicial: 50,
  pro: 200,
  luxury: null,
};

export const LIMITE_FACTURAS_PRUEBA = 10;

/** Tamaños medios usados para las estimaciones de espacio libre. */
export const PROMEDIO_KB = { foto: 500, comprobante: 300, pdf: 80 };

export const mb = (bytes: number) => bytes / 1048576;
export const formatoMB = (bytes: number) => {
  const value = mb(bytes);
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GB`;
  return `${value.toFixed(1)} MB`;
};
