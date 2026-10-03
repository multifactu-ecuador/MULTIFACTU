import test from "node:test";
import assert from "node:assert/strict";
import { accessKey, modulo11, preview, rentalDays } from "../shared/fiscal.ts";
import {
  simulateSignature,
  simulateSoap,
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
