// Motor de aprendizaje de RUFO.
//
// Convierte los datos agregados de UNA empresa en hallazgos candidatos
// (riesgos, oportunidades y patrones). El asistente los propone y el ADMIN
// los confirma o descarta: aquí no se decide nada ni se ejecuta acciones.
// Módulo puro (sin Deno ni red) para poder probarlo con node --test.
export type TipoHallazgo = "riesgo" | "oportunidad" | "patron";

export interface Hallazgo {
  clave: string;
  tipo: TipoHallazgo;
  titulo: string;
  detalle: string;
  evidencia: Record<string, number>;
  periodo: string;
}

export interface DatosTenant {
  /** Fecha de referencia AAAA-MM-DD (Ecuador). */
  hoy: string;
  /** Facturas autorizadas (los últimos días). */
  facturas: Array<{ fecha: string; total: number }>;
  /** Movimientos de caja del periodo. */
  movimientos: Array<{ fecha: string; tipo: string; monto: number }>;
  /** Cuotas con vencimiento en el periodo. */
  cuotas: Array<{ monto: number; pagado: number; vencimiento: string }>;
  /** Productos con stock bajo (<=3). */
  productos: Array<{ nombre: string; stock: number }>;
  /** Clientes con saldo por cobrar, de mayor a menor. */
  deudores: Array<{ nombre: string; saldo: number }>;
}

const usd = (n: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(n);

const mesDe = (fecha: string) => fecha.slice(0, 7);

/** Mes anterior a "AAAA-MM". */
function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

const sumaMes = (
  filas: Array<{ fecha: string; total: number }>,
  mes: string,
) => filas.filter((f) => String(f.fecha).startsWith(mes)).reduce((s, f) => s + Number(f.total), 0);

/** Umbral mínimo para proponer una variación de ventas (evita ruido). */
export const VARIACION_MINIMA = 15;

export function proponerHallazgos(datos: DatosTenant): Hallazgo[] {
  const periodo = mesDe(datos.hoy);
  const hallazgos: Hallazgo[] = [];

  // 1. Ventas del mes frente al mes anterior (sólo con volumen comparable).
  const actual = sumaMes(datos.facturas, periodo);
  const previo = sumaMes(datos.facturas, mesAnterior(periodo));
  if (previo > 0) {
    const dif = actual - previo;
    const pct = Math.round(Math.abs(dif / previo) * 100);
    if (pct >= VARIACION_MINIMA && dif < 0)
      hallazgos.push({
        clave: "ventas_a_la_baja",
        tipo: "riesgo",
        titulo: "Ventas por debajo del mes anterior",
        detalle: `Este mes llevas ${usd(actual)} frente a ${usd(previo)} del mes anterior: ${pct}% menos. Compara qué cambió (clientes, precios, temporada) y decide dónde actuar primero.`,
        evidencia: { actual, anterior: previo, variacion_pct: pct },
        periodo,
      });
    else if (pct >= VARIACION_MINIMA && dif > 0)
      hallazgos.push({
        clave: "ventas_al_alza",
        tipo: "oportunidad",
        titulo: "Ventas por encima del mes anterior",
        detalle: `Este mes llevas ${usd(actual)} frente a ${usd(previo)} del mes anterior: ${pct}% más. Revisa qué producto o cliente impulsó el alza para poder repetirlo.`,
        evidencia: { actual, anterior: previo, variacion_pct: pct },
        periodo,
      });
  }

  // 2. Cobranza vencida.
  const vencidas = datos.cuotas.filter(
    (c) => String(c.vencimiento) < datos.hoy && Number(c.pagado) < Number(c.monto),
  );
  if (vencidas.length) {
    const saldo = vencidas.reduce((s, c) => s + Number(c.monto) - Number(c.pagado), 0);
    hallazgos.push({
      clave: "cuotas_vencidas",
      tipo: "riesgo",
      titulo: "Cobranza vencida",
      detalle: `Tienes ${vencidas.length} cuotas vencidas por ${usd(saldo)}. Decide esta semana si haces cobro directo, ofrecer pronto pago o congelar nuevos créditos a esos clientes.`,
      evidencia: { cuotas: vencidas.length, saldo },
      periodo,
    });
  }

  // 3. Stock bajo.
  const bajos = datos.productos.filter((p) => Number(p.stock) <= 3);
  if (bajos.length) {
    const ejemplos = bajos.slice(0, 3).map((p) => `${p.nombre} (${p.stock})`).join(", ");
    hallazgos.push({
      clave: "stock_bajo",
      tipo: "riesgo",
      titulo: "Productos con stock bajo",
      detalle: `${bajos.length} producto(s) con 3 unidades o menos: ${ejemplos}. Decide si repones ahora o dejas de promocionarlos hasta reposición.`,
      evidencia: { productos: bajos.length, minimo: Math.min(...bajos.map((p) => Number(p.stock))) },
      periodo,
    });
  }

  // 4. Caja: egresos del mes por encima de los ingresos del mes.
  const delMes = datos.movimientos.filter((m) => String(m.fecha).startsWith(periodo));
  const ingresos = delMes
    .filter((m) => ["INGRESO", "GARANTIA"].includes(m.tipo))
    .reduce((s, m) => s + Number(m.monto), 0);
  const egresos = delMes
    .filter((m) => !["INGRESO", "GARANTIA"].includes(m.tipo))
    .reduce((s, m) => s + Number(m.monto), 0);
  if (egresos > ingresos && egresos > 0) {
    hallazgos.push({
      clave: "caja_en_contra",
      tipo: "riesgo",
      titulo: "Egresos por encima de los ingresos del mes",
      detalle: `En caja este mes entraron ${usd(ingresos)} y salieron ${usd(egresos)}. Revisa qué gasto puedes postergar o qué cobro acelerar antes de que se acumule.`,
      evidencia: { ingresos, egresos },
      periodo,
    });
  }

  // 5. Concentración: un solo cliente concentra el por cobrar.
  const totalPorCobrar = datos.deudores.reduce((s, d) => s + Number(d.saldo), 0);
  const tope = datos.deudores[0];
  if (totalPorCobrar > 0 && tope && Number(tope.saldo) >= totalPorCobrar * 0.4) {
    const pct = Math.round((Number(tope.saldo) / totalPorCobrar) * 100);
    hallazgos.push({
      clave: "dependencia_cliente",
      tipo: "riesgo",
      titulo: "Tu por cobrar depende de un cliente",
      detalle: `${tope.nombre} concentra el ${pct}% de tu por cobrar (${usd(Number(tope.saldo))} de ${usd(totalPorCobrar)}). Decide si limitas su crédito o diversificas ventas antes de que un atraso pesee.`,
      evidencia: { participacion_pct: pct, saldo: Number(tope.saldo), total: totalPorCobrar },
      periodo,
    });
  }

  return hallazgos;
}

/** Convierte la memoria activa en el bloque que viaja al modelo. */
export function memoriaTexto(
  memorias: Array<{ clave: string; valor: string }>,
  limite = 40,
): string {
  if (!memorias.length)
    return "(Todavía no hay memoria confirmada de este negocio. Si el dato es clave, invita al usuario a completar su perfil.)";
  return memorias
    .slice(0, limite)
    .map((m) => `- ${m.clave}: ${m.valor}`)
    .join("\n");
}
