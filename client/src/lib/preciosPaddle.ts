// Catálogo editable de planes para la página de precios con Paddle.
//
// Edita aquí textos y features. Los priceId (pri_…) NO son secretos: son
// identificadores públicos del catálogo. Se pegan después de crear el
// catálogo en la cuenta sandbox con:
//   $env:PADDLE_API_KEY="pdl_sdbx_..."; npx tsx scripts/seed-paddle-catalog.ts
// (Mantener mes/año alineados con los USD de PLAN_BASE en
// supabase/functions/_shared/pago-plan.ts: 6.99 / 11.99 / 18.99.)

export interface Tier {
  name: "Inicial" | "Pro" | "Luxury";
  description: string;
  features: string[];
  /** ID de precio Paddle: facturación mensual y anual. */
  priceId: { month: string; year: string };
  /** Etiqueta corta opcional (p. ej. "VENTAS + ALQUILER"). */
  badge?: string;
}

export const TIERES: Tier[] = [
  {
    name: "Inicial",
    description: "Lo esencial para vender y facturar.",
    features: [
      "Facturación electrónica (hasta 50 comprobantes/mes)",
      "Inventario y productos",
      "Servicios y proformas",
      "Gestión de clientes",
      "Nota de crédito",
      "Compartir comprobantes por WhatsApp/Correo",
    ],
    priceId: {
      month: "pri_01m4k5x9g6ds23sn82trk6kabm",
      year: "pri_01m4k5x9rmj3nf5z9an3tx4cdg",
    },
  },
  {
    name: "Pro",
    description: "Ventas y alquileres, bajo control.",
    features: [
      "Todo el plan Inicial",
      "Hasta 200 comprobantes/mes",
      "Alquiler de maquinaria y herramientas",
      "Contratos y garantías",
      "Control de fechas y disponibilidad",
      "Flujo completo de comprobantes",
    ],
    priceId: {
      month: "pri_01m4k5xa3vrkhenybtzcy9v1vy",
      year: "pri_01m4k5xa9kdfd73sjpdcvr703f",
    },
    badge: "VENTAS + ALQUILER",
  },
  {
    name: "Luxury",
    description: "Una visión completa de tu empresa.",
    features: [
      "Todo el plan Pro",
      "Comprobantes ilimitados",
      "Caja e ingresos y gastos",
      "Cuentas por cobrar y pagar",
      "Análisis de rentabilidad",
      "Facturación programada con IA",
      "Asistente IA de reportes comerciales",
      "Base para integración SRI y firma electrónica",
    ],
    priceId: {
      month: "pri_01m4k5xaq8tq5jbavmgjregnna",
      year: "pri_01m4k5xawayafpejgtqt02p50n",
    },
  },
];
