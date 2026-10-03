import { useEffect, useState } from "react";
import { db, check, money, today } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type { Client, Invoice } from "../lib/types";

interface ScheduledInvoice {
  id: string;
  tenant_id: string;
  cliente_id: string;
  items: Array<{ id: string; cantidad: number; descuento: number }>;
  metodo_pago: string;
  credito_dias: number;
  periodicidad: "diaria" | "semanal" | "mensual";
  dia_mes: number | null;
  dia_semana: number | null;
  proxima_fecha: string;
  activa: boolean;
  cliente?: Client;
}

export default function ScheduledInvoices() {
  const { access, allowed } = useAuth();
  const [rows, setRows] = useState<ScheduledInvoice[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showForm, setShowForm] = useState(false),
    [form, setForm] = useState({
      cliente_id: "",
      items: [] as Array<{ id: string; cantidad: number; descuento: number }>,
      metodo_pago: "20",
      credito_dias: 0,
      periodicidad: "mensual" as "diaria" | "semanal" | "mensual",
      dia_mes: 1,
      dia_semana: 0,
      inicio: today(),
    });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [si, cli] = await Promise.all([
        (db() as any).from("facturas_programadas").select("*"),
        db().from("clientes").select("*").order("nombre"),
      ]);
      if (!si.error) setRows((si.data as ScheduledInvoice[]) ?? []);
      if (!cli.error) setClients((cli.data as Client[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }

  async function addItem() {
    const prod = check(
      await db()
        .from("catalogo_maquinaria")
        .select("id, nombre, precio")
        .order("nombre"),
    );
    // Quick pick: here just for UI, real use would be a modal
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.cliente_id || !form.items.length) {
      setError("Cliente y al menos un ítem requeridos");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await check(
        await (db() as any).rpc("crear_factura_programada", {
          p_cliente: form.cliente_id,
          p_items: form.items,
          p_metodo: form.metodo_pago,
          p_credito: form.credito_dias,
          p_periodicidad: form.periodicidad,
          p_dia_mes: form.dia_mes,
          p_dia_semana: form.dia_semana,
          p_inicio: form.inicio,
        }),
      );
      setMessage("Factura programada creada (ID: " + r + ")");
      setShowForm(false);
      setForm({
        ...form,
        items: [],
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row: ScheduledInvoice) {
    setBusy(true);
    try {
      check(
        await (db() as any)
          .from("facturas_programadas")
          .update({ activa: !row.activa })
          .eq("id", row.id),
      );
      setMessage(
        "Factura programada " + (!row.activa ? "activada" : "desactivada"),
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FINANZAS / PROGRAMADAS</p>
          <h1>Facturas programadas.</h1>
          <p>
            Crea plantillas que emitan facturas automáticamente (diario, semanal o
            mensual). Solo plan Luxury.
          </p>
        </div>
        <button className="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Ocultar" : "+ Nueva programada"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}

      {showForm && (
        <form className="card" style={{ display: "grid", gap: "12px" }} onSubmit={submit}>
          <h2>Nueva factura programada</h2>
          <label>Cliente
            <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} required>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <div style={{ display: "grid", gap: "8px" }}>
            <h3>Ítems</h3>
            <button type="button" className="secondary" onClick={() => alert("Selecciona productos del catálogo en una próxima versión")}>
              Agregar ítem (pendiente UI completa)
            </button>
          </div>
          <label>Método de pago
            <select value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}>
              <option value="01">Efectivo</option>
              <option value="16">Débito</option>
              <option value="18">Prepago</option>
              <option value="19">Tarjeta</option>
              <option value="20">Otros</option>
            </select>
          </label>
          <label>Crédito (días)
            <input type="number" min="0" max="365" value={form.credito_dias} onChange={(e) => setForm({ ...form, credito_dias: Number(e.target.value) })} />
          </label>
          <label>Periodicidad
            <select value={form.periodicidad} onChange={(e) => setForm({ ...form, periodicidad: e.target.value as any })}>
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </label>
          {form.periodicidad === "mensual" && (
            <label>Día del mes (1-31)
              <input type="number" min="1" max="31" value={form.dia_mes} onChange={(e) => setForm({ ...form, dia_mes: Number(e.target.value) })} />
            </label>
          )}
          {form.periodicidad === "semanal" && (
            <label>Día semana (0=Dom..6=Sáb)
              <input type="number" min="0" max="6" value={form.dia_semana} onChange={(e) => setForm({ ...form, dia_semana: Number(e.target.value) })} />
            </label>
          )}
          <label>Fecha inicio
            <input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} required />
          </label>
          <div className="form-actions">
            <button disabled={busy} type="submit">
              {busy ? "Guardando…" : "Crear programada"}
            </button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Próxima fecha</th>
              <th>Periodicidad</th>
              <th>Método</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.cliente?.nombre ?? r.cliente_id.slice(0, 8)}</td>
                <td>{r.proxima_fecha}</td>
                <td>{r.periodicidad}{r.periodicidad === "mensual" && r.dia_mes ? " (día " + r.dia_mes + ")" : ""}{r.periodicidad === "semanal" && r.dia_semana !== null ? " (día " + r.dia_semana + ")" : ""}</td>
                <td>{r.metodo_pago}</td>
                <td>
                  <span className="pill">{r.activa ? "Activa" : "Pausada"}</span>
                </td>
                <td>
                  <button className="secondary" onClick={() => void toggleActive(r)}>
                    {r.activa ? "Pausar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No hay facturas programadas.</div>}
      </div>
    </section>
  );
}