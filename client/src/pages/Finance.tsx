import { useEffect, useState, useRef, type FormEvent } from "react";
import { db, check, money, today } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type {
  Movement,
  Installment,
  Closing,
  ExpenseTemplate,
  Client,
  Invoice,
} from "../lib/types";
const methods: Record<string, string> = {
  "01": "Efectivo",
  "16": "Débito",
  "18": "Prepago",
  "19": "Crédito",
  "20": "Transferencia",
};
export default function Finance() {
  const { access } = useAuth();
  const [movements, setMovements] = useState<Movement[]>([]),
    [quotas, setQuotas] = useState<Installment[]>([]),
    [closings, setClosings] = useState<Closing[]>([]),
    [templates, setTemplates] = useState<ExpenseTemplate[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [payables, setPayables] = useState<any[]>([]),
    [suppliers, setSuppliers] = useState<any[]>([]),
    [invoices, setInvoices] = useState<Invoice[]>([]),
    [invoiceLines, setInvoiceLines] = useState<any[]>([]),
    [tab, setTab] = useState("resumen"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [from, setFrom] = useState(today().slice(0, 8) + "01"),
    [to, setTo] = useState(today()),
    [physical, setPhysical] = useState("0"),
    [date, setDate] = useState(today()),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false),
    operationTokens = useRef<Record<string, string>>({});
  function operationToken(payload: unknown) {
    const key = JSON.stringify(payload);
    return (operationTokens.current[key] ??= crypto.randomUUID());
  }
  async function load() {
    const [m, q, c, p, cs, pay, supp, inv, det] = await Promise.all([
      db()
        .from("movimientos_caja")
        .select("*")
        .order("fecha", { ascending: false }),
      db().from("cuotas").select("*").order("vencimiento"),
      db()
        .from("cierres_caja")
        .select("*")
        .order("fecha", { ascending: false }),
      db().from("plantillas_gastos").select("*"),
      db().from("clientes").select("*"),
      (db() as any).from("cuentas_por_pagar").select("*"),
      (db() as any).from("proveedores").select("*"),
      (db() as any).from("facturas_sri").select("*").in("estado", ["Autorizada"]),
      (db() as any).from("factura_detalles").select("*"),
    ]);
    setMovements(check(m) ?? []);
    setQuotas(check(q) ?? []);
    setClosings(check(c) ?? []);
    setTemplates(check(p) ?? []);
    setClients(check(cs) ?? []);
    setPayables((pay?.data as any[]) ?? []);
    setSuppliers((supp?.data as any[]) ?? []);
    setInvoices((inv?.data as Invoice[]) ?? []);
    setInvoiceLines((det?.data as any[]) ?? []);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);
  const filtered = movements.filter((m) => m.fecha >= from && m.fecha <= to),
    income = filtered
      .filter((m) => m.tipo === "INGRESO")
      .reduce((s, m) => s + Number(m.monto), 0),
    expenses = filtered
      .filter((m) => m.tipo === "EGRESO")
      .reduce((s, m) => s + Number(m.monto), 0),
    balance = quotas.reduce(
      (s, q) => s + Number(q.monto) - Number(q.pagado),
      0,
    );
  const byMethod = Object.entries(methods).map(([code, label]) => ({
    code,
    label,
    total: filtered
      .filter((m) => m.tipo === "INGRESO" && m.metodo_pago === code)
      .reduce((s, m) => s + Number(m.monto), 0),
  }));
  const max = Math.max(1, ...byMethod.map((m) => m.total));
  const salesCosts = invoiceLines.reduce(
    (s, l) => s + Number(l.costo_snapshot ?? 0) * Number(l.cantidad),
    0,
  );
  const salesTotal = invoices.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const profit = salesTotal - salesCosts;
  const pendingPayables = payables.filter((p) => Number(p.pagado) < Number(p.monto));
  const system = movements
    .filter((m) => m.fecha === date && m.metodo_pago === "01")
    .reduce(
      (s, m) =>
        s +
        Number(m.monto) *
          (m.tipo === "INGRESO" || m.tipo === "GARANTIA" ? 1 : -1),
      0,
    );
  async function action(work: () => Promise<unknown>, success: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      operationTokens.current = {};
      await load();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function saveTemplate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget,
      v = new FormData(f);
    await action(async () => {
      check(
        await db()
          .from("plantillas_gastos")
          .insert({
            tenant_id: access!.tenant_id,
            nombre: String(v.get("nombre")),
            categoria: String(v.get("categoria")),
            monto: Number(v.get("monto")),
            dia_mes: Number(v.get("dia")),
            activa: true,
          }),
      );
      f.reset();
    }, "Plantilla guardada. Es un recordatorio; no ejecuta pagos automáticos.");
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTROL EMPRESARIAL / LUXURY</p>
          <h1>Finanzas más claras.</h1>
          <p>Separa facturación, cobros y dinero disponible.</p>
        </div>
        <div className="date-filter">
          <input
            aria-label="Desde"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            aria-label="Hasta"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      <div className="metric-grid">
        {[
          ["Cobros recibidos", income],
          ["Gastos registrados", expenses],
          ["Flujo neto", income - expenses],
          ["Cuentas por cobrar", balance],
        ].map(([label, value]) => (
          <article className="card" key={label}>
            <small>{label}</small>
            <b>{money(Number(value))}</b>
            <span>Datos de tu empresa</span>
          </article>
        ))}
      </div>
      <div className="tabs">
        {[
          ["resumen", "Resumen"],
          ["caja", "Cierre de caja"],
          ["cartera", "Cuentas por cobrar"],
          ["pagar", "Cuentas x pagar"],
          ["utilidad", "Utilidad"],
          ["gastos", "Gastos y recordatorios"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? "active" : ""}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {tab === "resumen" && (
        <div className="finance-grid">
          <section className="card">
            <h2>Ingresos por método de pago</h2>
            <p className="muted">Cobros explícitos del período seleccionado.</p>
            <div className="payment-chart">
              {byMethod.map((m) => (
                <div key={m.code}>
                  <span>{m.label}</span>
                  <div>
                    <i style={{ width: (m.total / max) * 100 + "%" }} />
                  </div>
                  <b>{money(m.total)}</b>
                </div>
              ))}
            </div>
            <small>
              Garantías excluidas de ingresos por ventas; no son base ni IVA.
            </small>
          </section>
          <section className="card">
            <h2>Movimientos recientes</h2>
            {filtered.slice(0, 8).map((m) => (
              <div className="movement-row" key={m.id}>
                <span>
                  <b>{m.descripcion}</b>
                  <small>
                    {m.fecha} · {methods[m.metodo_pago]}
                  </small>
                </span>
                <b>
                  {m.tipo === "EGRESO" ? "−" : "+"}
                  {money(Number(m.monto))}
                </b>
              </div>
            ))}
            {!filtered.length && (
              <p className="muted">Aún no hay movimientos registrados.</p>
            )}
          </section>
        </div>
      )}
      {tab === "caja" && (
        <>
          <div className="finance-grid">
            <form
              className="card"
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  async () =>
                    check(
                      await db().rpc("cerrar_caja", {
                        p_fecha: date,
                        p_fisico: Number(physical),
                      }),
                    ),
                  "Cierre registrado. Se bloquearon nuevos movimientos de ese día.",
                );
              }}
            >
              <h2>Arqueo de caja</h2>
              <label>
                Fecha del cierre
                <input
                  type="date"
                  value={date}
                  max={today()}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Efectivo contado físicamente ($)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={physical}
                  onChange={(e) => setPhysical(e.target.value)}
                  required
                />
              </label>
              <dl className="totals">
                <div>
                  <dt>Sistema · efectivo neto</dt>
                  <dd>{money(system)}</dd>
                </div>
                <div>
                  <dt>Conteo físico</dt>
                  <dd>{money(Number(physical))}</dd>
                </div>
                <div className="grand-total">
                  <dt>Diferencia</dt>
                  <dd>{money(Number(physical) - system)}</dd>
                </div>
              </dl>
              <button disabled={busy}>Cerrar caja</button>
              <small>
                PostgreSQL recalcula el efectivo y aplica el cierre de manera
                atómica.
              </small>
            </form>
            <section className="card">
              <h2>Una caja, un cierre claro.</h2>
              <p>
                Cuenta billetes y monedas. Compara con ingresos menos salidas en
                efectivo del día. Transferencias y tarjetas se muestran en el
                resumen, pero no forman parte del efectivo físico.
              </p>
              <p>
                Los cierres anteriores quedan marcados como retroactivos. No se
                ejecutan pagos ni se convierten garantías en ventas
                automáticamente.
              </p>
            </section>
          </div>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sistema</th>
                  <th>Físico</th>
                  <th>Diferencia</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.fecha}
                      {c.retroactivo && <small>Retroactivo</small>}
                    </td>
                    <td>{money(Number(c.efectivo_sistema))}</td>
                    <td>{money(Number(c.efectivo_fisico))}</td>
                    <td>{money(Number(c.diferencia))}</td>
                    <td>
                      <span className="pill">{c.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === "cartera" && (
        <div className="card table-wrap">
          <h2>Cuotas y abonos</h2>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Vencimiento</th>
                <th>Monto / saldo</th>
                <th>Estado</th>
                <th>Registrar abono</th>
              </tr>
            </thead>
            <tbody>
              {quotas.map((q) => (
                <tr key={q.id}>
                  <td>
                    {clients.find((c) => c.id === q.cliente_id)?.nombre ??
                      q.cliente_id}
                  </td>
                  <td>{q.vencimiento}</td>
                  <td>
                    {money(Number(q.monto))}
                    <small>
                      Saldo {money(Number(q.monto) - Number(q.pagado))}
                    </small>
                  </td>
                  <td>
                    {Number(q.pagado) >= Number(q.monto)
                      ? "pagado"
                      : q.vencimiento < today()
                        ? "vencido"
                        : "pendiente"}
                  </td>
                  <td>
                    {Number(q.pagado) < Number(q.monto) && (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = new FormData(e.currentTarget);
                          void action(
                            async () =>
                              check(
                                await db().rpc("registrar_abono", {
                                  p_cuota: q.id,
                                  p_monto: Number(v.get("monto")),
                                  p_metodo: String(v.get("metodo")),
                                  p_token: operationToken([
                                    "abono",
                                    q.id,
                                    ...v.entries(),
                                  ]),
                                }),
                              ),
                            "Abono registrado",
                          );
                        }}
                      >
                        <input
                          name="monto"
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={Number(q.monto) - Number(q.pagado)}
                          aria-label={"Abono " + q.id}
                          required
                        />
                        <select name="metodo" aria-label="Método del abono">
                          {Object.entries(methods).map(([v, n]) => (
                            <option key={v} value={v}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <button disabled={busy}>Abonar</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <small>
            La emisión no acredita cobro. Los abonos explícitos crean el ingreso
            y reducen el saldo en una sola transacción.
          </small>
        </div>
      )}
      {tab === "utilidad" && (
        <div className="finance-grid">
          <section className="card">
            <h2>Utilidad (ventas autorizadas)</h2>
            <table>
              <tbody>
                <tr><td>Ventas totales</td><td>{money(salesTotal)}</td></tr>
                <tr><td>Costo de lo vendido</td><td>{money(salesCosts)}</td></tr>
                <tr><td>Utilidad bruta estimada</td><td>{money(profit)}</td></tr>
                <tr><td>Margen</td><td>{salesTotal > 0 ? ((profit / salesTotal) * 100).toFixed(1) : "0"}%</td></tr>
              </tbody>
            </table>
            <small>Tomado de facturas Autorizadas y el costo registrado en cada detalle.</small>
          </section>
        </div>
      )}
      {tab === "pagar" && (
        <div className="finance-grid">
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget, v = new FormData(form);
              void action(async () => {
                let proveedorId = String(v.get("proveedor") || "");
                const nuevo = String(v.get("nproveedor") || "").trim();
                const ruc = String(v.get("nruc") || "").trim();
                if (!proveedorId && nuevo) {
                  if (!/^\d{13}$/.test(ruc)) throw Error("RUC de 13 dígitos requerido para proveedor nuevo");
                  const { data: created, error: cErr } = await (db() as any)
                    .from("proveedores")
                    .insert({
                      tenant_id: access?.tenant_id,
                      ruc,
                      razon_social: nuevo,
                      email: "",
                      direccion: "",
                    })
                    .select("*")
                    .single();
                  if (cErr) throw cErr;
                  proveedorId = created.id;
                }
                if (!proveedorId) throw Error("Elige o crea un proveedor");
                check(
                  await (db() as any).from("cuentas_por_pagar").insert({
                    tenant_id: access?.tenant_id,
                    proveedor_id: proveedorId,
                    descripcion: String(v.get("descripcion")),
                    monto: Number(v.get("monto")),
                    vencimiento: String(v.get("vencimiento")),
                  }),
                );
                form.reset();
              }, "Cuenta por pagar registrada");
            }}
          >
            <h2>Nueva cuenta por pagar</h2>
            <label>Proveedor (existente)
              <select name="proveedor">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.razon_social}</option>
                ))}
              </select>
            </label>
            <label>Nuevo proveedor (opc.)
              <input name="nproveedor" placeholder="Nombre del nuevo proveedor" />
            </label>
            <label>RUC nuevo proveedor<input name="nruc" inputMode="numeric" placeholder="Opcional si el anterior vacío" /></label>
            <label>Descripción<input name="descripcion" required /></label>
            <label>Monto $<input name="monto" type="number" min="0.01" step="0.01" required /></label>
            <label>Vencimiento<input name="vencimiento" type="date" required /></label>
            <button disabled={busy}>Guardar deuda</button>
          </form>
          <section className="card">
            <h2>Deudas pendientes</h2>
            <table>
              <tbody>
                {pendingPayables.map((p) => {
                  const lef = Math.max(0, Number(p.monto) - Number(p.pagado));
                  const v = new FormData();
                  v.set("monto", String(lef));
                  return (
                    <tr key={p.id}>
                      <td>{p.descripcion}<br /><small>{lef > 0 ? money(lef) + " de " + money(p.monto) + " al" : "Pagada"}</small></td>
                      <td>{lef === 0 ? "Pagada" : (
                        <form
                          onSubmit={(ev) => {
                            ev.preventDefault();
                            const fd = new FormData(ev.currentTarget);
                            const abono = Number(fd.get("abono"));
                            void action(async () => {
                              check(
                                await (db() as any).from("cuentas_por_pagar").update({ pagado: Number(p.pagado) + abono }).eq("id", p.id),
                              );
                              check(
                                await db().rpc("registrar_gasto", {
                                  p_monto: abono,
                                  p_metodo: String(fd.get("metodo")),
                                  p_categoria: "Cuentas por pagar",
                                  p_descripcion: "Abono a: " + p.descripcion,
                                  p_token: operationToken(["abono-cpp", p.id, abono, String(fd.get("metodo"))]),
                                }),
                              );
                            }, "Abono registrado");
                          }}
                        >
                          <input name="abono" type="number" min="0.01" max={lef} step="0.01" required defaultValue={lef} placeholder="Abono $" />
                          <select name="metodo">{Object.entries(methods).map(([v2, n]) => <option key={v2} value={v2}>{n}</option>)}</select>
                          <button>Abonar</button>
                        </form>
                      )}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {tab === "gastos" && (
        <div className="finance-grid">
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                v = new FormData(form);
              void action(async () => {
                check(
                  await db().rpc("registrar_gasto", {
                    p_monto: Number(v.get("monto")),
                    p_metodo: String(v.get("metodo")),
                    p_categoria: String(v.get("categoria")),
                    p_descripcion: String(v.get("descripcion")),
                    p_token: operationToken(["gasto", ...v.entries()]),
                  }),
                );
                form.reset();
              }, "Gasto registrado");
            }}
          >
            <h2>Registrar gasto</h2>
            <label>
              Descripción
              <input name="descripcion" required minLength={2} />
            </label>
            <label>
              Categoría
              <select name="categoria">
                <option>Materiales</option>
                <option>Nómina</option>
                <option>Servicios</option>
                <option>Mantenimiento</option>
                <option>Otros</option>
              </select>
            </label>
            <label>
              Monto ($)
              <input
                name="monto"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              Método
              <select name="metodo">
                {Object.entries(methods).map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy}>Guardar gasto</button>
          </form>
          <section className="card">
            <h2>Plantillas recurrentes</h2>
            <p className="muted">
              Recordatorios por día del mes; no ejecutan pagos.
            </p>
            <form onSubmit={saveTemplate}>
              <label>
                Nombre
                <input name="nombre" required />
              </label>
              <div className="field-pair">
                <label>
                  Monto ($)
                  <input
                    name="monto"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Día del mes
                  <input name="dia" type="number" min="1" max="31" required />
                </label>
              </div>
              <label>
                Categoría
                <input name="categoria" required defaultValue="Servicios" />
              </label>
              <button disabled={busy}>Guardar plantilla</button>
            </form>
            {templates.map((t) => (
              <div className="movement-row" key={t.id}>
                <span>
                  <b>{t.nombre}</b>
                  <small>
                    Día {t.dia_mes} · {t.categoria}
                  </small>
                </span>
                <b>{money(Number(t.monto))}</b>
              </div>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
