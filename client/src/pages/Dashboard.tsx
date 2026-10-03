import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { db, check, money, today } from "../lib/supabase";
import type { Client, Invoice, Movement } from "../lib/types";
export default function Dashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [movements, setMovements] = useState<Movement[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [quotaBalance, setQuotaBalance] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void Promise.all([
      db().from("facturas_sri").select("*").order("creado_en", { ascending: false }).limit(50),
      db().from("movimientos_caja").select("*").order("fecha", { ascending: false }).limit(90),
      db().from("clientes").select("*"),
      db().from("cuotas").select("*"),
    ])
      .then(([inv, mov, cli, quo]) => {
        if (!live) return;
        setInvoices(check(inv) ?? []);
        setMovements(check(mov) ?? []);
        setClients(check(cli) ?? []);
        const qs = check(quo) ?? [];
        setQuotaBalance(qs.reduce((s, q) => s + Number(q.monto) - Number(q.pagado), 0));
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, []);
  const thisMonth = today().slice(0, 7);
  const salesMonth = invoices
    .filter((i) => i.estado === "Autorizada" && String((i as any).creado_en).slice(0, 7) === thisMonth)
    .reduce((s, i) => s + Number(i.total), 0);
  const income = movements.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + Number(m.monto), 0);
  const expenses = movements.filter((m) => m.tipo === "EGRESO").reduce((s, m) => s + Number(m.monto), 0);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INICIO</p>
          <h1>Tu negocio de un vistazo.</h1>
          <p>Ventas autorizadas del mes, caja y cartera rápida.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="metric-grid">
        {[
          ["Ventas autorizadas (mes)", money(salesMonth)],
          ["Ingresos (caja)", money(income)],
          ["Egresos", money(expenses)],
          ["Cuentas por cobrar", money(quotaBalance)],
          ["Clientes", String(clients.length)],
        ].map(([label, value]) => (
          <article key={String(label)} className="card">
            <small>{label}</small>
            <b>{value}</b>
          </article>
        ))}
      </div>
      <div className="finance-grid">
        <section className="card">
          <h2>Últimas ventas</h2>
          <table>
            <tbody>
              {invoices.slice(0, 8).map((i) => (
                <tr key={i.id}>
                  <td>{String(i.fecha).slice(0, 10)}</td>
                  <td>{i.numero_autorizacion ? i.numero_autorizacion.slice(0, 8) : i.id.slice(0, 8)}</td>
                  <td>{i.estado}</td>
                  <td>{money(Number(i.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Enlaces rápidos</h2>
          <p>
            <Link to="/app/venta" className="button">Punto de venta</Link>{" "}
            <Link to="/app/alquiler" className="button light">Alquiler</Link>{" "}
            <Link to="/app/finanzas" className="button light">Finanzas</Link>
          </p>
        </section>
      </div>
    </section>
  );
}
