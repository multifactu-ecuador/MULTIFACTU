export function validarCedula(value: string): boolean {
  if (
    !/^\d{10}$/.test(value) ||
    Number(value.slice(0, 2)) < 1 ||
    Number(value.slice(0, 2)) > 24 ||
    Number(value[2]) > 5
  )
    return false;
  const sum = [...value.slice(0, 9)].reduce((s, d, i) => {
    let n = Number(d) * (i % 2 === 0 ? 2 : 1);
    return s + (n > 9 ? n - 9 : n);
  }, 0);
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}
/** Algoritmos tradicionales: no prueban registro/estado y no bloquean RUC excepcionales. */
export function validarRucTradicional(value: string): boolean {
  if (
    !/^\d{13}$/.test(value) ||
    Number(value.slice(0, 2)) < 1 ||
    Number(value.slice(0, 2)) > 24
  )
    return false;
  const third = Number(value[2]);
  if (third < 6)
    return validarCedula(value.slice(0, 10)) && Number(value.slice(10)) > 0;
  const coeff =
    third === 9
      ? [4, 3, 2, 7, 6, 5, 4, 3, 2]
      : third === 6
        ? [3, 2, 7, 6, 5, 4, 3, 2]
        : [];
  if (!coeff.length) return false;
  const rem =
    11 - (coeff.reduce((s, c, i) => s + c * Number(value[i]), 0) % 11);
  const dv = rem === 11 ? 0 : rem;
  return (
    dv < 10 &&
    dv === Number(value[coeff.length]) &&
    Number(value.slice(coeff.length + 1)) > 0
  );
}
export function validarIdentificacion(
  type: CustomerType,
  value: string,
): { valid: boolean; warning?: string } {
  if (type === "07") return { valid: value === "9999999999999" };
  if (type === "05") return { valid: validarCedula(value) };
  if (!/^\d{13}$/.test(value)) return { valid: false };
  return {
    valid: true,
    warning: validarRucTradicional(value)
      ? undefined
      : "El RUC requiere verificación en el SRI; el algoritmo tradicional no coincide.",
  };
}
type CustomerType = "04" | "05" | "07";
