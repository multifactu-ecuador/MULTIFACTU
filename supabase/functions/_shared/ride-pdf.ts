import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.3";

export interface RideData {
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  direccionMatriz: string;
  direccionEstablecimiento: string;
  ambiente: "1" | "2";
  tipoComprobante: "01" | "04";
  establecimiento: string;
  puntoEmision: string;
  secuencial: number;
  fechaEmision: string;
  claveAcceso: string;
  tipoIdentificacionComprador: string;
  identificacionComprador: string;
  razonSocialComprador: string;
  direccionComprador?: string;
  emailComprador?: string;
  subtotal5: number;
  subtotal15: number;
  subtotal0: number;
  subtotalNoObjetoIva: number;
  descuento: number;
  ice: number;
  iva5: number;
  iva15: number;
  iva0: number;
  ivaNoObjeto: number;
  propina: number;
  importeTotal: number;
  moneda: "DOLAR";
  detalles: Array<{
    codigoPrincipal: string;
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    precioTotalSinImpuesto: number;
    iva: 0 | 5 | 15;
    ice?: number;
  }>;
  formasPago: Array<{
    formaPago: string;
    total: number;
    plazo?: number;
    unidadTiempo?: string;
  }>;
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  /** Régimen y parámetros fiscales del emisor (Anexos 21, 22 y 26 de la Ficha Técnica 2.34). */
  regimen?: "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";
  obligadoContabilidad?: boolean;
  /** N° de resolución de agente de retención ya normalizado (sin ceros). */
  agenteRetencion?: string;
  /** N° de resolución de contribuyente especial. */
  contribuyenteEspecial?: string;
  /** RUC del proveedor del sistema (Anexo 26); sólo se imprime si está configurado. */
  rucProveedor?: string;
}

const money = (v: number) => v.toFixed(2);

export async function generateRidePdf(data: RideData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = height - 40;

  const drawText = (text: string, x: number, y: number, size = 8, bold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
  };
  const drawLine = (y: number) => {
    page.drawLine({ start: { x: 30, y }, end: { x: width - 30, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  };

  // CABECERA
  drawText("RIDE - REPRESENTACIÓN IMPRESA DEL COMPROBANTE ELECTRÓNICO", 30, y, 10, true);
  y -= 18;

  drawText(`RUC: ${data.ruc}`, 30, y, 8, true);
  drawText(`RAZÓN SOCIAL: ${data.razonSocial}`, 30, y - 12, 8);
  drawText(`NOMBRE COMERCIAL: ${data.nombreComercial}`, 30, y - 24, 8);
  drawText(`DIR. MATRIZ: ${data.direccionMatriz}`, 30, y - 36, 8);
  drawText(`DIR. ESTABLECIMIENTO: ${data.direccionEstablecimiento}`, 30, y - 48, 8);
  // Régimen del emisor: mismas leyendas que el XML (Anexos 21 y 22).
  let cabecera = y - 60;
  if (data.regimen === "rimpe_emprendedor") {
    drawText("CONTRIBUYENTE RÉGIMEN RIMPE", 30, cabecera, 8, true);
    cabecera -= 12;
  } else if (data.regimen === "rimpe_negocio_popular") {
    drawText("CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE", 30, cabecera, 8, true);
    cabecera -= 12;
  }
  if (data.agenteRetencion) {
    drawText(`AGENTE DE RETENCIÓN · RESOLUCIÓN ${data.agenteRetencion}`, 30, cabecera, 8, true);
    cabecera -= 12;
  }
  if (data.contribuyenteEspecial) {
    drawText(`CONTRIBUYENTE ESPECIAL · RESOLUCIÓN ${data.contribuyenteEspecial}`, 30, cabecera, 8, true);
    cabecera -= 12;
  }
  drawText(`OBLIGADO A LLEVAR CONTABILIDAD: ${data.obligadoContabilidad ? "SI" : "NO"}`, 30, cabecera, 8);
  cabecera -= 12;
  drawText(`AMBIENTE: ${data.ambiente === "1" ? "PRUEBAS" : "PRODUCCIÓN"}`, 30, cabecera, 8, true);
  y = cabecera - 20;

  // QR
  const qrDataUrl = await QRCode.toDataURL(data.claveAcceso, { width: 100, margin: 1 });
  const qrImage = await pdf.embedPng(qrDataUrl.split(",")[1]);
  page.drawImage(qrImage, { x: width - 150, y: y - 80, width: 100, height: 100 });

  drawText("CLAVE DE ACCESO", width - 150, y + 20, 7, true);
  drawText(data.claveAcceso.match(/.{1,49}/g)?.join(" ") ?? data.claveAcceso, width - 150, y + 8, 6);
  y -= 30;

  drawText(`TIPO: ${data.tipoComprobante === "01" ? "FACTURA" : "NOTA DE CRÉDITO"}`, 30, y, 9, true);
  drawText(`ESTABLECIMIENTO: ${data.establecimiento}  PUNTO EMISIÓN: ${data.puntoEmision}  SECUENCIAL: ${String(data.secuencial).padStart(9, "0")}`, 30, y - 14, 8);
  drawText(`FECHA EMISIÓN: ${data.fechaEmision}`, 30, y - 28, 8);
  if (data.numeroAutorizacion) {
    drawText(`NÚMERO AUTORIZACIÓN: ${data.numeroAutorizacion}`, 30, y - 42, 8, true);
    drawText(`FECHA AUTORIZACIÓN: ${data.fechaAutorizacion}`, 30, y - 56, 8);
  } else {
    drawText("EMISIÓN EN FASE DE VALIDACIÓN · SIN VALIDEZ TRIBUTARIA", 30, y - 42, 8, true);
  }
  y -= 80;

  drawText("DATOS DEL COMPRADOR", 30, y, 9, true);
  y -= 16;
  drawText(`TIPO ID: ${data.tipoIdentificacionComprador}  IDENTIFICACIÓN: ${data.identificacionComprador}`, 30, y, 8);
  drawText(`RAZÓN SOCIAL / NOMBRE: ${data.razonSocialComprador}`, 30, y - 14, 8);
  if (data.direccionComprador) drawText(`DIRECCIÓN: ${data.direccionComprador}`, 30, y - 28, 8);
  if (data.emailComprador) drawText(`EMAIL: ${data.emailComprador}`, 30, y - 42, 8);
  y -= 60;

  // Tabla detalles
  drawText("DETALLES", 30, y, 9, true);
  y -= 16;
  const colX = [30, 80, 200, 300, 370, 440, 500];
  const headers = ["CÓD.", "DESCRIPCIÓN", "CANT.", "P. UNIT.", "DESC.", "TOTAL", "IVA"];
  headers.forEach((h, i) => drawText(h, colX[i], y, 7, true));
  drawLine(y - 4);
  y -= 18;

  for (const d of data.detalles) {
    if (y < 80) { pdf.addPage(); y = height - 40; }
    drawText(d.codigoPrincipal, colX[0], y, 7);
    drawText(d.descripcion.substring(0, 45), colX[1], y, 7);
    drawText(d.cantidad.toFixed(2), colX[2], y, 7);
    drawText(money(d.precioUnitario), colX[3], y, 7);
    drawText(money(d.descuento), colX[4], y, 7);
    drawText(money(d.precioTotalSinImpuesto), colX[5], y, 7);
    drawText(`${d.iva}%`, colX[6], y, 7);
    y -= 14;
  }
  drawLine(y);
  y -= 18;

  // Totales
  const tx = 380;
  drawText(`SUBTOTAL 15%: $${money(data.subtotal15)}`, tx, y, 8); y -= 14;
  drawText(`SUBTOTAL 5%: $${money(data.subtotal5)}`, tx, y, 8); y -= 14;
  drawText(`SUBTOTAL 0%: $${money(data.subtotal0)}`, tx, y, 8); y -= 14;
  drawText(`DESCUENTO: $${money(data.descuento)}`, tx, y, 8); y -= 14;
  drawText(`IVA 15%: $${money(data.iva15)}`, tx, y, 8, true); y -= 14;
  drawText(`IVA 5%: $${money(data.iva5)}`, tx, y, 8, true); y -= 14;
  drawText(`PROPINA: $${money(data.propina)}`, tx, y, 8); y -= 14;
  drawText(`IMPORTE TOTAL: $${money(data.importeTotal)}`, tx, y, 10, true); y -= 24;

  drawText("FORMAS DE PAGO", 30, y, 9, true); y -= 16;
  data.formasPago.forEach(fp => {
    drawText(`${fp.formaPago} - $${money(fp.total)}${fp.plazo ? ` (${fp.plazo} ${fp.unidadTiempo})` : ""}`, 30, y, 8);
    y -= 14;
  });
  y -= 10;

  if (data.rucProveedor) {
    // Anexo 26: el campo "RUC Proveedor" forma parte de la información
    // adicional del comprobante y el RIDE debe mostrarlo.
    drawText("INFORMACIÓN ADICIONAL", 30, y, 8, true);
    drawText(`RUC PROVEEDOR: ${data.rucProveedor}`, 30, y - 14, 8);
    y -= 30;
  }

  drawText("ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN COMPROBANTE ELECTRÓNICO", 30, y, 7, true);
  drawText(`Clave de acceso: ${data.claveAcceso}`, 30, y - 14, 6);
  drawText("Su autenticidad puede verificarse en https://www.sri.gob.ec", 30, y - 26, 6);

  return pdf.save();
}
