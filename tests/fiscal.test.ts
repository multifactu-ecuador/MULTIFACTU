import test from "node:test";
import assert from "node:assert/strict";
import { accessKey, modulo11, preview, rentalDays } from "../shared/fiscal.ts";
import {
  RUC_PROVEEDOR,
  generateCreditNoteXml,
  generateXml,
  simulateSignature,
  simulateSoap,
} from "../supabase/functions/_shared/sri.ts";
import type {
  SriInvoice,
  SriLine,
} from "../supabase/functions/_shared/sri.ts";
test("Clave de 49 dígitos y verificador independiente", () => {
  const key = accessKey({
    date: "2026-10-02",
    document: "01",
    ruc: "1790016919001",
    environment: "1",
    estab: "001",
    point: "001",
    sequence: 1,
    numericCode: "12345678",
  });
  assert.match(key, /^\d{49}$/);
  assert.equal(Number(key[48]), modulo11(key.slice(0, 48)));
});
test("Tarifas separadas y descuento antes del IVA", () => {
  const p = preview([
    { quantity: 1, price: 100, discount: 10, vat: 15 },
    { quantity: 1, price: 20, discount: 0, vat: 5 },
    { quantity: 1, price: 5, discount: 0, vat: 0 },
  ]);
  assert.deepEqual(p.bases, { 0: 500, 5: 2000, 15: 9000 });
  assert.equal(p.total, 12950);
  assert.throws(() =>
    preview([{ quantity: 1, price: 1, discount: 2, vat: 15 }]),
  );
});
test("Alquiler redondea períodos de 24 horas y rechaza retorno anterior", () => {
  assert.equal(
    rentalDays("2026-10-02T08:00:00-05:00", "2026-10-03T08:01:00-05:00"),
    2,
  );
  assert.throws(() => rentalDays("2026-10-03", "2026-10-02"));
});
test("Firma y autorización DEMO nunca representan certificados reales", async () => {
  const xml = simulateSignature('<factura id="comprobante"/>');
  assert.match(xml, /SIN VALIDEZ TRIBUTARIA/);
  assert.doesNotMatch(xml, /ds:Signature/);
  const result = await simulateSoap(xml, "test", false);
  assert.equal(result.authorized, false);
  assert.match(result.xml, /NO AUTORIZADO/);
});

const baseLine: SriLine = {
  descripcion: "Servicio de prueba",
  cantidad: 1,
  precio: 10,
  descuento: 0,
  iva: 15,
  base: 10,
  impuesto: 1.5,
};
const baseInvoice = {
  id: "inv-1",
  tenant_id: "t-1",
  fecha: "2026-10-02",
  ambiente_sri: "pruebas",
  establecimiento: "001",
  punto_emision: "001",
  secuencial: 1,
  subtotal_0: 0,
  subtotal_5: 0,
  subtotal_15: 10,
  iva_5: 0,
  iva_15: 1.5,
  total: 11.5,
  descuentos: 0,
  metodo_pago: "01",
  credito_dias: 0,
  emisor_snapshot: {
    ruc: "1790016919001",
    razon_social: "EMISORA PRUEBA",
    direccion: "Quito",
  },
  cliente_snapshot: {
    tipo_id: "04",
    identificacion: "1712345678",
    nombre: "CLIENTE PRUEBA",
    direccion: "Quito",
  },
} as unknown as SriInvoice;

test("Comprobante incluye el campo RUC Proveedor solo si está configurado", () => {
  const { xml } = generateXml(baseInvoice, [baseLine], "12345678");
  const { xml: nota } = generateCreditNoteXml(
    {
      ...baseInvoice,
      motivo: "Devolución",
    } as unknown as Parameters<typeof generateCreditNoteXml>[0],
    { ...baseInvoice, clave_acceso: "1".repeat(49), fecha: "2026-10-02" },
    [baseLine],
    "Devolución",
    "87654321",
  );

  // Estructura: el nodo infoAdicional va como hijo directo de la raíz,
  // después de </detalles> (Ficha Técnica v2.34, Anexo 26).
  for (const doc of [xml, nota]) {
    assert.doesNotMatch(doc, /<\/detalles><infoFactura>/);
  }

  if (RUC_PROVEEDOR) {
    const esperado = `<infoAdicional><campoAdicional nombre="RUC Proveedor">${RUC_PROVEEDOR}</campoAdicional></infoAdicional>`;
    assert.ok(xml.includes(esperado));
    assert.ok(nota.includes(esperado));
  } else {
    // Sin RUC de proveedor configurado no se emite el nodo, para no enviar
    // un dato falso o incompleto al SRI.
    assert.doesNotMatch(xml, /infoAdicional/);
    assert.doesNotMatch(nota, /infoAdicional/);
  }
});
