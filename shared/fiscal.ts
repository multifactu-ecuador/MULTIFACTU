export type Vat = 0 | 5 | 15;
export interface PreviewLine {
  quantity: number;
  price: number;
  discount: number;
  vat: Vat;
}
/** Sólo vista previa; PostgreSQL vuelve a calcular con precios autoritativos y NUMERIC. */
export function preview(lines: PreviewLine[]) {
  const bases: Record<Vat, number> = { 0: 0, 5: 0, 15: 0 };
  let taxes = 0,
    discount = 0;
  for (const l of lines) {
    if (
      ![l.quantity, l.price, l.discount].every(Number.isFinite) ||
      l.quantity <= 0 ||
      l.price < 0 ||
      l.discount < 0
    )
      throw Error("Importes inválidos");
    const base =
      Math.round(l.quantity * Math.round(l.price * 100)) -
      Math.round(l.discount * 100);
    if (base < 0) throw Error("Descuento superior al importe");
    bases[l.vat] += base;
    taxes += Math.round((base * l.vat) / 100);
    discount += Math.round(l.discount * 100);
  }
  return {
    bases,
    taxes,
    discount,
    total: bases[0] + bases[5] + bases[15] + taxes,
  };
}
export function rentalDays(start: string, end: string) {
  const seconds = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw Error("Devolución debe ser posterior a entrega");
  return Math.ceil(seconds / 86400000);
}
export function modulo11(input: string) {
  if (!/^\d+$/.test(input)) throw Error("Sólo dígitos");
  let sum = 0,
    factor = 2;
  for (let i = input.length - 1; i >= 0; i--) {
    sum += Number(input[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const result = 11 - (sum % 11);
  return result === 11 ? 0 : result === 10 ? 1 : result;
}
export function accessKey(x: {
  date: string;
  document: "01" | "04";
  ruc: string;
  environment: "1" | "2";
  estab: string;
  point: string;
  sequence: number;
  numericCode: string;
}) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(x.date) ||
    !/^\d{13}$/.test(x.ruc) ||
    !/^\d{3}$/.test(x.estab) ||
    !/^\d{3}$/.test(x.point) ||
    !/^\d{8}$/.test(x.numericCode) ||
    !Number.isInteger(x.sequence) ||
    x.sequence < 1 ||
    x.sequence > 999999999
  )
    throw Error("Datos de clave inválidos");
  const [year, month, day] = x.date.split("-");
  const body =
    day +
    month +
    year +
    x.document +
    x.ruc +
    x.environment +
    x.estab +
    x.point +
    String(x.sequence).padStart(9, "0") +
    x.numericCode +
    "1";
  if (body.length !== 48) throw Error("Clave incompleta");
  return body + modulo11(body);
}
