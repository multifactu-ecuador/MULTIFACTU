import { accessKey } from "../../../shared/fiscal.ts";
export interface SriInvoice {
  id: string;
  tenant_id: string;
  fecha: string;
  ambiente_sri: "pruebas" | "produccion";
  establecimiento: string;
  punto_emision: string;
  secuencial: number;
  subtotal_0: number;
  subtotal_5: number;
  subtotal_15: number;
  iva_5: number;
  iva_15: number;
  total: number;
  descuentos: number;
  metodo_pago: string;
  credito_dias: number;
  emisor_snapshot: { ruc: string; razon_social: string; direccion: string };
  cliente_snapshot: {
    tipo_id: string;
    identificacion: string;
    nombre: string;
    direccion: string;
  };
}
export interface SriLine {
  descripcion: string;
  cantidad: number;
  precio: number;
  descuento: number;
  iva: 0 | 5 | 15;
  base: number;
  impuesto: number;
}
const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const money = (v: number) => Number(v).toFixed(2);
const ivaCode = { 0: "0", 5: "5", 15: "4" };

/**
 * RUC del proveedor del sistema de facturación (MULTIFACTU).
 * Resolución SRI NAC-DGERCGC26-00000027 y Ficha Técnica v2.34 (Anexo 26):
 * todo comprobante electrónico debe incluir, en `infoAdicional`, el campo
 * "RUC Proveedor" con el RUC del desarrollador del software.
 *
 * PENDIENTE: cuando el RUC del proveedor esté emitido, reemplazar el valor.
 * Mientras tanto queda vacío y el nodo NO se emite, para no enviar un dato
 * falso al SRI.
 */
export const RUC_PROVEEDOR = "";

/**
 * Nodo `infoAdicional` con el campo "RUC Proveedor" (Ficha Técnica v2.34,
 * Anexo 26). Va como hijo directo de la raíz del comprobante, después de
 * `</detalles>`. Devuelve cadena vacía si el RUC del proveedor aún no está
 * configurado, para no emitir un campo incompleto que el SRI rechazaría.
 */
const infoAdicionalProveedor = () =>
  RUC_PROVEEDOR
    ? `<infoAdicional><campoAdicional nombre="RUC Proveedor">${escape(RUC_PROVEEDOR)}</campoAdicional></infoAdicional>`
    : "";
export function generateXml(
  invoice: SriInvoice,
  lines: SriLine[],
  numericCode: string,
) {
  const e = invoice.emisor_snapshot,
    c = invoice.cliente_snapshot;
  const key = accessKey({
    date: invoice.fecha,
    document: "01",
    ruc: e.ruc,
    environment: invoice.ambiente_sri === "pruebas" ? "1" : "2",
    estab: invoice.establecimiento,
    point: invoice.punto_emision,
    sequence: Number(invoice.secuencial),
    numericCode,
  });
  const date = invoice.fecha.split("-").reverse().join("/");
  const groups = ([0, 5, 15] as const)
    .map((v) => ({
      v,
      base: Number(
        invoice[
          v === 0 ? "subtotal_0" : v === 5 ? "subtotal_5" : "subtotal_15"
        ],
      ),
      tax: v === 0 ? 0 : Number(invoice[v === 5 ? "iva_5" : "iva_15"]),
    }))
    .filter((g) => g.base > 0);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>${invoice.ambiente_sri === "pruebas" ? "1" : "2"}</ambiente><tipoEmision>1</tipoEmision><razonSocial>${escape(e.razon_social)}</razonSocial><ruc>${escape(e.ruc)}</ruc><claveAcceso>${key}</claveAcceso><codDoc>01</codDoc><estab>${escape(invoice.establecimiento)}</estab><ptoEmi>${escape(invoice.punto_emision)}</ptoEmi><secuencial>${String(invoice.secuencial).padStart(9, "0")}</secuencial><dirMatriz>${escape(e.direccion || "Ecuador")}</dirMatriz></infoTributaria><infoFactura><fechaEmision>${date}</fechaEmision><tipoIdentificacionComprador>${escape(c.tipo_id)}</tipoIdentificacionComprador><razonSocialComprador>${escape(c.nombre)}</razonSocialComprador><identificacionComprador>${escape(c.identificacion)}</identificacionComprador><totalSinImpuestos>${money(Number(invoice.subtotal_0) + Number(invoice.subtotal_5) + Number(invoice.subtotal_15))}</totalSinImpuestos><totalDescuento>${money(invoice.descuentos)}</totalDescuento><totalConImpuestos>${groups.map((g) => `<totalImpuesto><codigo>2</codigo><codigoPorcentaje>${ivaCode[g.v]}</codigoPorcentaje><baseImponible>${money(g.base)}</baseImponible><valor>${money(g.tax)}</valor></totalImpuesto>`).join("")}</totalConImpuestos><propina>0.00</propina><importeTotal>${money(invoice.total)}</importeTotal><moneda>DOLAR</moneda><pagos><pago><formaPago>${escape(invoice.metodo_pago)}</formaPago><total>${money(invoice.total)}</total>${invoice.credito_dias ? `<plazo>${invoice.credito_dias}</plazo><unidadTiempo>dias</unidadTiempo>` : ""}</pago></pagos></infoFactura><detalles>${lines.map((l, i) => `<detalle><codigoPrincipal>ITEM-${i + 1}</codigoPrincipal><descripcion>${escape(l.descripcion)}</descripcion><cantidad>${Number(l.cantidad).toFixed(6)}</cantidad><precioUnitario>${Number(l.precio).toFixed(6)}</precioUnitario><descuento>${money(l.descuento)}</descuento><precioTotalSinImpuesto>${money(l.base)}</precioTotalSinImpuesto><impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>${ivaCode[l.iva]}</codigoPorcentaje><tarifa>${l.iva.toFixed(2)}</tarifa><baseImponible>${money(l.base)}</baseImponible><valor>${money(l.impuesto)}</valor></impuesto></impuestos></detalle>`).join("")}</detalles>${infoAdicionalProveedor()}</factura>`;
  return { key, xml };
}

// V1.1.0 — estructura conforme al esquema SRI para codDoc 04.
export function generateCreditNoteXml(
  nota: {
    id: string;
    fecha?: string;
    ambiente_sri: "pruebas" | "produccion";
    establecimiento: string;
    punto_emision: string;
    secuencial: number;
    motivo: string;
    subtotal_0: number;
    subtotal_5: number;
    subtotal_15: number;
    iva_5: number;
    iva_15: number;
    total: number;
  },
  factura: SriInvoice & { clave_acceso: string; fecha: string },
  lines: SriLine[],
  motivo: string,
  numericCode: string,
) {
  const e = factura.emisor_snapshot,
    c = factura.cliente_snapshot;
  const key = accessKey({
    date: (nota.fecha ?? factura.fecha).slice(0, 10),
    document: "04",
    ruc: e.ruc,
    environment: nota.ambiente_sri === "pruebas" ? "1" : "2",
    estab: nota.establecimiento,
    point: nota.punto_emision,
    sequence: Number(nota.secuencial),
    numericCode,
  });
  const date = (nota.fecha ?? factura.fecha).slice(0, 10).split("-").reverse().join("/");
  const refNumber = `${factura.establecimiento}-${factura.punto_emision}-${String(factura.secuencial).padStart(9, "0")}`;
  const groups = ([0, 5, 15] as const)
    .map((v) => ({
      v,
      base: Number(
        nota[
          v === 0 ? "subtotal_0" : v === 5 ? "subtotal_5" : "subtotal_15"
        ],
      ),
      tax: v === 0 ? 0 : Number(nota[v === 5 ? "iva_5" : "iva_15"]),
    }))
    .filter((g) => g.base > 0);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<notaCredito id="comprobante" version="1.1.0"><infoTributaria><ambiente>${nota.ambiente_sri === "pruebas" ? "1" : "2"}</ambiente><tipoEmision>1</tipoEmision><razonSocial>${escape(e.razon_social)}</razonSocial><ruc>${escape(e.ruc)}</ruc><claveAcceso>${key}</claveAcceso><codDoc>04</codDoc><estab>${escape(nota.establecimiento)}</estab><ptoEmi>${escape(nota.punto_emision)}</ptoEmi><secuencial>${String(nota.secuencial).padStart(9, "0")}</secuencial><dirMatriz>${escape(e.direccion || "Ecuador")}</dirMatriz></infoTributaria><infoNotaCredito><fechaEmision>${date}</fechaEmision><dirEstablecimiento>${escape(e.direccion || "Ecuador")}</dirEstablecimiento><tipoIdentificacionComprador>${escape(c.tipo_id)}</tipoIdentificacionComprador><razonSocialComprador>${escape(c.nombre)}</razonSocialComprador><identificacionComprador>${escape(c.identificacion)}</identificacionComprador><codDocModificado>01</codDocModificado><numDocModificado>${refNumber}</numDocModificado><fechaEmisionDocSustento>${factura.fecha.split("-").reverse().join("/")}</fechaEmisionDocSustento><totalSinImpuestos>${money(Number(nota.subtotal_0) + Number(nota.subtotal_5) + Number(nota.subtotal_15))}</totalSinImpuestos><valorModificacion>${money(nota.total)}</valorModificacion><moneda>DOLAR</moneda><totalConImpuestos>${groups.map((g) => `<totalImpuesto><codigo>2</codigo><codigoPorcentaje>${ivaCode[g.v]}</codigoPorcentaje><baseImponible>${money(g.base)}</baseImponible><valor>${money(g.tax)}</valor></totalImpuesto>`).join("")}</totalConImpuestos><motivo>${escape(motivo)}</motivo></infoNotaCredito><detalles>${lines.map((l, i) => `<detalle><codigoInterno>ITEM-${i + 1}</codigoInterno><descripcion>${escape(l.descripcion)}</descripcion><cantidad>${Number(l.cantidad).toFixed(2)}</cantidad><precioUnitario>${Number(l.precio).toFixed(6)}</precioUnitario><descuento>${money(l.descuento)}</descuento><precioTotalSinImpuesto>${money(l.base)}</precioTotalSinImpuesto><impuestos><impuesto><codigo>2</codigo><codigoPorcentaje>${ivaCode[l.iva]}</codigoPorcentaje><tarifa>${Number(l.iva).toFixed(2)}</tarifa><baseImponible>${money(l.base)}</baseImponible><valor>${money(l.impuesto)}</valor></impuesto></impuestos></detalle>`).join("")}</detalles>${infoAdicionalProveedor()}</notaCredito>`;
  return { key, xml };
}
/** No es una firma XAdES-BES. Nunca genera ds:Signature ni usa un certificado real. */
export function simulateSignature(xml: string) {
  return xml.replace(
    "<factura ",
    "<!-- FIRMA SIMULADA: SIN VALIDEZ TRIBUTARIA -->\n<factura ",
  );
}
export type FetchLike = (request: Request) => Promise<Response>;
/** Transporte sustituible: respeta fetch/Request/Response, sin llamar al SRI real. */
export function mockSriFetch(
  authorized: boolean,
  invoiceId: string,
): FetchLike {
  return async (request) => {
    if (
      request.method !== "POST" ||
      !(await request.text()).includes("soapenv:Envelope")
    )
      throw Error("Solicitud SOAP inválida");
    if (request.url.includes("RecepcionComprobantesOffline"))
      return new Response(
        "<RespuestaRecepcionComprobante><estado>RECIBIDA</estado></RespuestaRecepcionComprobante>",
        { headers: { "Content-Type": "text/xml" } },
      );
    return new Response(
      `<autorizacion><estado>${authorized ? "AUTORIZADO" : "NO AUTORIZADO"}</estado><numeroAutorizacion>DEMO-${escape(invoiceId)}</numeroAutorizacion><fechaAutorizacion>${new Date().toISOString()}</fechaAutorizacion><mensaje>SIMULACION SIN VALIDEZ TRIBUTARIA</mensaje></autorizacion>`,
      { headers: { "Content-Type": "text/xml" } },
    );
  };
}
export async function simulateSoap(
  xml: string,
  id: string,
  authorized: boolean,
  fetcher: FetchLike = mockSriFetch(authorized, id),
) {
  const bytes = new TextEncoder().encode(xml);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const response = await fetcher(
    new Request(
      "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
      {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
        body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sri="http://ec.gob.sri.ws.recepcion"><soapenv:Body><sri:validarComprobante><xml>${btoa(binary)}</xml></sri:validarComprobante></soapenv:Body></soapenv:Envelope>`,
      },
    ),
  );
  if (!response.ok) throw Error("Transporte SOAP simulado falló");
  const reception = await response.text();
  if (!reception.includes("<estado>RECIBIDA</estado>"))
    throw Error("Recepción simulada devuelta");
  const key = xml.match(/<claveAcceso>(\d{49})<\/claveAcceso>/)?.[1] ?? "DEMO";
  const authorization = await fetcher(
    new Request(
      "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
      {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8" },
        body: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sri="http://ec.gob.sri.ws.autorizacion"><soapenv:Body><sri:autorizacionComprobante><claveAccesoComprobante>${key}</claveAccesoComprobante></sri:autorizacionComprobante></soapenv:Body></soapenv:Envelope>`,
      },
    ),
  );
  if (!authorization.ok) throw Error("Autorización simulada falló");
  const authorizationXml = await authorization.text();
  return {
    authorized: authorizationXml.includes("<estado>AUTORIZADO</estado>"),
    xml: authorizationXml,
    number: "DEMO-" + id,
  };
}
