export type Plan = "inicial" | "pro" | "luxury";
export type Feature =
  | "facturacion"
  | "inventario"
  | "clientes"
  | "proformas"
  | "alquiler"
  | "finanzas"
  | "analisis"
  | "programada"
  | "configuracion";
export interface Company {
  id: string;
  tenant_id: string;
  nombre: string;
  identificacion_registro: string;
  ruc: string | null;
  razon_social: string;
  direccion: string;
  ambiente_sri: "pruebas" | "produccion";
  establecimiento: string;
  punto_emision: string;
  ruta_p12: string | null;
  logo_path: string | null;
  /** Referencia opaca al secreto cifrado en Supabase Vault (nunca la contraseña). */
  p12_secret_id?: string | null;
  regimen?: "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";
  obligado_contabilidad?: boolean;
  /** N° de resolución de agente de retención sin ceros a la izquierda (Anexo 21). */
  agente_retencion?: string | null;
  /** N° de resolución de contribuyente especial, 3-13 alfanuméricos. */
  contribuyente_especial?: string | null;
  creado_en: string;
}
export interface Subscription {
  id: string;
  tenant_id: string;
  plan: Plan;
  estado: "trial" | "active" | "expired" | "suspended";
  inicio: string;
  fin: string;
}
export interface Access {
  tenant_id: string;
  rol: "ADMIN" | "CAJERO";
  nombre: string;
  ahora: string;
  /** true sólo para la empresa del dueño del sistema: todo habilitado siempre. */
  superadmin?: boolean;
  /** Facturas emitidas en la prueba gratuita (límite 10 en PostgreSQL). */
  facturas_prueba?: number;
  /** Datos personales de la página "Mi cuenta". */
  telefono?: string | null;
  avatar_path?: string | null;
  empresa: Company;
  suscripcion: Subscription;
  funciones: Record<Feature, boolean>;
}
export interface Client {
  id: string;
  tenant_id: string;
  tipo_id: "04" | "05" | "07";
  identificacion: string;
  nombre: string;
  email: string;
  direccion: string;
  limite_credito: number;
}
export interface Product {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  tipo: "EQUIPO" | "PRODUCTO" | "SERVICIO";
  estado: "Disponible" | "Alquilado" | "Mantenimiento";
  costo: number;
  precio: number;
  iva: 0 | 5 | 15;
  stock: number;
}
export interface Invoice {
  id: string;
  tenant_id: string;
  fecha: string;
  estado: "Pendiente" | "Procesando" | "Autorizada" | "Error";
  simulacion: boolean;
  total: number;
  mensaje: string | null;
  clave_acceso: string | null;
  numero_autorizacion: string | null;
  xml_borrador: string | null;
  xml_firmado: string | null;
}
export interface CreditNote {
  id: string;
  tenant_id: string;
  factura_id: string;
  estado: "Pendiente" | "Procesando" | "Autorizada" | "Error";
  simulacion: boolean;
  motivo: string;
  total: number;
  secuencial: number | null;
  clave_acceso: string | null;
  numero_autorizacion: string | null;
  mensaje: string | null;
  creado_en: string;
}
export interface Movement {
  id: string;
  tenant_id: string;
  tipo: "INGRESO" | "EGRESO" | "GARANTIA" | "DEVOLUCION_GARANTIA";
  monto: number;
  metodo_pago: string;
  categoria: string;
  descripcion: string;
  fecha: string;
  cuota_id: string | null;
  token: string;
  creado_por: string;
}
export interface Installment {
  id: string;
  tenant_id: string;
  factura_id: string;
  cliente_id: string;
  vencimiento: string;
  monto: number;
  pagado: number;
}
export interface Closing {
  id: string;
  tenant_id: string;
  fecha: string;
  efectivo_sistema: number;
  efectivo_fisico: number;
  diferencia: number;
  estado: "cuadrado" | "descuadre";
  retroactivo: boolean;
  creado_por: string;
  creado_en: string;
}
export interface ExpenseTemplate {
  id: string;
  tenant_id: string;
  nombre: string;
  categoria: string;
  monto: number;
  dia_mes: number;
  proveedor_id: string | null;
  activa: boolean;
}
export interface Rental {
  id: string;
  tenant_id: string;
  cliente_id: string;
  salida: string;
  retorno: string;
  estado: "ACTIVO" | "DEVUELTO" | "CANCELADO";
  garantia: number;
}
export interface RentalLine {
  id: string;
  tenant_id: string;
  contrato_id: string;
  equipo_id: string;
  tarifa_dia: number;
}
// Memoria y aprendizaje de RUFO por empresa: el navegador sólo lee (RLS de
// ADMIN); confirmar, descartar u olvidar pasa por el asistente (service role).
export interface RufoMemoria {
  id: string;
  tenant_id: string;
  clave: string;
  valor: string;
  origen: "declarado" | "aprendido";
  activo: boolean;
  creado_en: string;
}

export interface RufoAprendizaje {
  id: string;
  tenant_id: string;
  clave: string;
  tipo: "riesgo" | "oportunidad" | "patron";
  titulo: string;
  detalle: string;
  evidencia: Record<string, number>;
  periodo: string;
  estado: "propuesto" | "confirmado" | "descartado";
  creado_en: string;
  revisado_en: string | null;
}

// Tipos de las tablas utilizadas por la UI. Reemplazables por supabase gen types.
type Table<T> = {
  Row: { [K in keyof T]: T[K] };
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: [];
};
export interface Database {
  public: {
    Tables: {
      empresas: Table<Company>;
      suscripciones: Table<Subscription>;
      clientes: Table<Client>;
      catalogo_maquinaria: Table<Product>;
      facturas_sri: Table<Invoice>;
      notas_credito: Table<CreditNote>;
      movimientos_caja: Table<Movement>;
      cuotas: Table<Installment>;
      cierres_caja: Table<Closing>;
      plantillas_gastos: Table<ExpenseTemplate>;
      contratos_alquiler: Table<Rental>;
      contratos_detalles: Table<RentalLine>;
      rufo_memoria: Table<RufoMemoria>;
      rufo_aprendizaje: Table<RufoAprendizaje>;
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      mi_acceso: { Args: Record<string, never>; Returns: Access };
      crear_nota_credito: {
        Args: { p_factura: string; p_motivo: string };
        Returns: string;
      };
      crear_factura_programada: {
        Args: {
          p_cliente: string;
          p_items: Array<{ id: string; cantidad: number; descuento: number }>;
          p_metodo: string;
          p_credito: number;
          p_periodicidad: string;
          p_dia_mes: number;
          p_dia_semana: number;
          p_inicio: string;
        };
        Returns: string;
      };
      procesar_facturas_programadas: {
        Args: Record<string, never>;
        Returns: number;
      };
      registrar_alquiler_interno: {
        Args: {
          p_cliente: string;
          p_items: Array<{ id: string; cantidad: number; descuento: number }>;
          p_metodo: string;
          p_salida: string;
          p_retorno: string;
          p_garantia: number;
          p_token: string;
        };
        Returns: string;
      };
      crear_mi_empresa: {
        Args: {
          p_empresa: string;
          p_identificacion: string;
          p_nombre: string;
          p_consentimiento: boolean;
          p_version_terminos: string;
          p_version_privacidad: string;
        };
        Returns: string;
      };
      crear_factura: {
        Args: {
          p_cliente: string;
          p_items: Array<{ id: string; cantidad: number; descuento: number }>;
          p_token: string;
          p_metodo: string;
          p_credito_dias: number;
          p_tipo: string;
          p_salida?: string | null;
          p_retorno?: string | null;
          p_garantia: number;
        };
        Returns: string;
      };
      registrar_abono: {
        Args: {
          p_cuota: string;
          p_monto: number;
          p_metodo: string;
          p_token: string;
        };
        Returns: string;
      };
      registrar_gasto: {
        Args: {
          p_monto: number;
          p_metodo: string;
          p_categoria: string;
          p_descripcion: string;
          p_token: string;
        };
        Returns: string;
      };
      cerrar_caja: {
        Args: { p_fecha: string; p_fisico: number };
        Returns: string;
      };
      guardar_p12_password: {
        Args: { p_password: string };
        Returns: undefined;
      };
      crear_proforma: {
        Args: {
          p_cliente: string;
          p_items: Array<{ id: string; cantidad: number; descuento: number }>;
          p_metodo?: string;
          p_credito_dias?: number;
          p_validez_dias?: number;
        };
        Returns: { id: string; numero: number; token: string };
      };
      anular_proforma: {
        Args: { p_id: string };
        Returns: undefined;
      };
      ver_proforma: {
        Args: { p_token: string };
        Returns: unknown;
      };
      aprobar_proforma: {
        Args: { p_token: string };
        Returns: { estado: string; factura?: string };
      };
      rechazar_proforma: {
        Args: { p_token: string };
        Returns: { estado: string };
      };
    };
  };
}
