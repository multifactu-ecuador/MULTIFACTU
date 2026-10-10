// Catálogo editable de planes para la página de precios con Paddle.
//
// Edita aquí textos y features. Los priceId (pri_…) NO son secretos: son
// identificadores públicos del catálogo. Los IDs de abajo son los de la
// cuenta LIVE, replicados desde sandbox con:
//   npx tsx scripts/paddle-live-migrate.ts
// (correspondencia completa en scripts/paddle-live-mapping.json).
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
      month: "pri_01m4kny7wyj6rdrn7c0z20s8tq",
      year: "pri_01m4kny7qp593d3mrvw1zzxkmf",
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
      month: "pri_01m4kny8hrgbm7t6rc6grcb27z",
      year: "pri_01m4kny8cs584jz19hx29m92yk",
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
      month: "pri_01m4kny94w7tnae6x41feb1gh9",
      year: "pri_01m4kny8zhtkpkpmdh10sm55tg",
    },
  },
];
