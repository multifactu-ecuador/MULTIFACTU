import test from "node:test";
import assert from "node:assert/strict";
import {
  memoriaTexto,
  proponerHallazgos,
  VARIACION_MINIMA,
  type DatosTenant,
} from "../supabase/functions/_shared/rufo-learning.ts";

// Datos de una empresa "tranquila": nada debería proponerse (sin ruido).
const tranquilo = (): DatosTenant => ({
  hoy: "2026-10-05",
  facturas: [],
  movimientos: [],
  cuotas: [],
  productos: [],
  deudores: [],
});

const de = (mes: string, total: number) => ({ fecha: `${mes}-10`, total });

test("sin datos no propone nada (no inventa hallazgos)", () => {
  assert.deepEqual(proponerHallazgos(tranquilo()), []);
});

test("ventas del mes igual al anterior no generan ruido", () => {
  const d = tranquilo();
  d.facturas = [de("2026-09", 1000), de("2026-10", 1000)];
  assert.deepEqual(proponerHallazgos(d), []);
});

test("caída de ventas >= al umbral propone un riesgo con evidencia", () => {
  const d = tranquilo();
  d.facturas = [de("2026-09", 1000), de("2026-10", 700)];
  const h = proponerHallazgos(d);
  assert.equal(h.length, 1);
  assert.equal(h[0].clave, "ventas_a_la_baja");
  assert.equal(h[0].tipo, "riesgo");
  assert.equal(h[0].evidencia.actual, 700);
  assert.equal(h[0].evidencia.anterior, 1000);
  assert.equal(h[0].evidencia.variacion_pct, 30);
  assert.equal(h[0].periodo, "2026-10");
});

test("alza de ventas >= al umbral propone una oportunidad", () => {
  const d = tranquilo();
  d.facturas = [de("2026-09", 1000), de("2026-10", 1200)];
  const h = proponerHallazgos(d);
  assert.equal(h.length, 1);
  assert.equal(h[0].clave, "ventas_al_alza");
  assert.equal(h[0].tipo, "oportunidad");
});

test("variación por debajo del umbral queda en silencio", () => {
  const d = tranquilo();
  d.facturas = [de("2026-09", 1000), de("2026-10", 1000 - 10)];
  assert.ok(10 < VARIACION_MINIMA);
  assert.deepEqual(proponerHallazgos(d), []);
});

test("cuotas vencidas sin pagar proponen cobranza con el saldo exacto", () => {
  const d = tranquilo();
  d.cuotas = [
    { monto: 100, pagado: 40, vencimiento: "2026-09-01" },
    { monto: 50, pagado: 50, vencimiento: "2026-09-15" }, // pagada, no cuenta
    { monto: 80, pagado: 0, vencimiento: "2026-11-01" }, // futura, no cuenta
  ];
  const h = proponerHallazgos(d);
  assert.equal(h.length, 1);
  assert.equal(h[0].clave, "cuotas_vencidas");
  assert.equal(h[0].evidencia.cuotas, 1);
  assert.equal(h[0].evidencia.saldo, 60);
});

test("stock bajo proponiendo hasta qué reponer", () => {
  const d = tranquilo();
  d.productos = [
    { nombre: "Rotomartillo", stock: 2 },
    { nombre: "Mecha 1/2", stock: 0 },
    { nombre: "Compresor", stock: 8 }, // no entra
  ];
  const h = proponerHallazgos(d);
  assert.equal(h.length, 1);
  assert.equal(h[0].clave, "stock_bajo");
  assert.equal(h[0].evidencia.productos, 2);
  assert.equal(h[0].evidencia.minimo, 0);
  assert.ok(h[0].detalle.includes("Rotomartillo (2)"));
});

test("egresos del mes por encima de ingresos proponen riesgo de caja", () => {
  const d = tranquilo();
  d.movimientos = [
    { fecha: "2026-10-01", tipo: "INGRESO", monto: 300 },
    { fecha: "2026-10-02", tipo: "EGRESO", monto: 500 },
  ];
  const h = proponerHallazgos(d);
  assert.equal(h.length, 1);
  assert.equal(h[0].clave, "caja_en_contra");
  assert.equal(h[0].evidencia.ingresos, 300);
  assert.equal(h[0].evidencia.egresos, 500);
});

test("caja con ingresos mayores no propone nada", () => {
  const d = tranquilo();
  d.movimientos = [
    { fecha: "2026-10-01", tipo: "INGRESO", monto: 800 },
    { fecha: "2026-10-02", tipo: "EGRESO", monto: 200 },
  ];
  assert.deepEqual(proponerHallazgos(d), []);
});

test("un cliente concentra el por cobrar: riesgo de dependencia", () => {
  const d = tranquilo();
  d.deudores = [
    { nombre: "Constructora Manabí", saldo: 700 },
    { nombre: "Varios", saldo: 300 },
  ];
  const h = proponerHallazgos(d);
  assert.equal(h.length, 1);
  assert.equal(h[0].clave, "dependencia_cliente");
  assert.equal(h[0].evidencia.participacion_pct, 70);
  assert.ok(h[0].detalle.includes("Constructora Manabí"));
});

test("un solo mes de ventas (sin comparación) no propone variación", () => {
  const d = tranquilo();
  d.facturas = [de("2026-10", 500)];
  assert.deepEqual(proponerHallazgos(d), []);
});

test("los hallazgos se agrupan bajo el periodo actual (sin duplicados)", () => {
  const d = tranquilo();
  d.hoy = "2026-10-31";
  d.facturas = [de("2026-09", 1000), de("2026-08", 1000)];
  d.cuotas = [{ monto: 10, pagado: 0, vencimiento: "2026-10-01" }];
  const h = proponerHallazgos(d);
  assert.ok(h.length >= 2);
  for (const hallazgo of h) assert.equal(hallazgo.periodo, "2026-10");
});

test("memoriaTexto lista los recuerdos o explica que aún no hay", () => {
  assert.ok(memoriaTexto([]).includes("Todavía no hay memoria"));
  const texto = memoriaTexto([
    { clave: "perfil", valor: "Alquiler de maquinaria en Manabí" },
    { clave: "riesgo", valor: "El lunes vendo 60% menos" },
  ]);
  assert.ok(texto.includes("- perfil: Alquiler de maquinaria en Manabí"));
  assert.ok(texto.includes("- riesgo: El lunes vendo 60% menos"));
  // Nunca manda más de 40 recuerdos al modelo.
  const largo = memoriaTexto(
    Array.from({ length: 60 }, (_, i) => ({ clave: "k", valor: `v${i}` })),
  );
  assert.equal(largo.split("\n").length, 40);
});
