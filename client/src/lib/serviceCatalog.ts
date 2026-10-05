/**
 * Catálogo de servicios recomendado por sectores.
 * Las descripciones son genéricas y aptas como detalle del comprobante
 * electrónico SRI (el nombre del ítem viaja a la factura en <descripcion>).
 * El usuario siempre puede editar el texto antes de guardar.
 */
export interface ServiceSector {
  sector: string;
  servicios: string[];
}

export const CATALOGO_SERVICIOS: ServiceSector[] = [
  {
    sector: "Inmobiliario, Bienes Raíces y Equipos",
    servicios: [
      "Arrendamiento comercial (locales, bodegas, oficinas)",
      "Arrendamiento de vivienda (casas, departamentos)",
      "Alquiler / arrendamiento de maquinaria y equipos",
      "Alícuotas / expensas de mantenimiento",
    ],
  },
  {
    sector: "Mantenimiento, Instalación y Soporte Técnico",
    servicios: [
      "Servicio de mantenimiento preventivo",
      "Servicio de mantenimiento correctivo / reparación",
      "Servicios de instalación y montaje",
      "Soporte técnico y diagnóstico",
    ],
  },
  {
    sector: "Servicios Profesionales y Consultoría",
    servicios: [
      "Honorarios profesionales (asesoría legal, contable, médica, etc.)",
      "Servicios de consultoría / asesoría tecnológica",
      "Gestión y tramitología",
    ],
  },
  {
    sector: "Transporte, Logística y Alquileres Operativos",
    servicios: [
      "Servicio de transporte de carga / envíos",
      "Servicio de envasado, empaque y etiquetado",
      "Alquiler de vehículos",
    ],
  },
  {
    sector: "Publicidad, Diseño y Marketing",
    servicios: [
      "Servicios de marketing digital y publicidad",
      "Diseño gráfico y producción audiovisual",
      "Desarrollo web / software a medida",
    ],
  },
];

/** Opción comodín para rubros no listados. */
export const OTRO_SERVICIO = "Otro servicio (escriba su servicio)";

/** Código sugerido único para un servicio nuevo. */
export const sugerirCodigoServicio = () =>
  `SERV-${Math.floor(1000 + Math.random() * 9000)}`;
