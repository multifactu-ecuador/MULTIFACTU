import { useEffect, useState } from "react";
import { Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { db, check, money, today } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { preview } from "../../../shared/fiscal.ts";
import type { Client, Product } from "../lib/types";

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

interface FormItem {
  product: Product;
  cantidad: number;
  descuento: number;
}

const METODOS: Record<string, string> = {
  "01": "Efectivo",
  "16": "T. débito",
  "18": "Prepago",
  "19": "T. crédito",
  "20": "Transferencia",
};

export default function ScheduledInvoices() {
  const { access } = useAuth();
  const [rows, setRows] = useState<ScheduledInvoice[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showForm, setShowForm] = useState(false),
    [search, setSearch] = useState(""),
    [form, setForm] = useState({
      cliente_id: "",
      metodo_pago: "20",
      credito_dias: 0,
      periodicidad: "mensual" as "diaria" | "semanal" | "mensual",
      dia_mes: 1,
      dia_semana: 1,
      inicio: today(),
    }),
    [items, setItems] = useState<FormItem[]>([]);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [si, cli, pro] = await Promise.all([
        (db() as any).from("facturas_programadas").select("*"),
        db().from("clientes").select("*").order("nombre"),
        db().from("catalogo_maquinaria").select("*").order("nombre"),
      ]);
      if (!si.error) setRows((si.data as ScheduledInvoice[]) ?? []);
      if (!cli.error) setClients((cli.data as Client[]) ?? []);
      if (!pro.error) setProducts((pro.data as Product[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }

  const addItem = (p: Product) => {
    if (items.some((i) => i.product.id === p.id)) return;
    setItems((x) => [...x, { product: p, cantidad: 1, descuento: 0 }]);
    setSearch("");
  };

  let summary: ReturnType<typeof preview> | null = null,
    calcError = "";
  try {
    summary = items.length
      ? preview(
          items.map((i) => ({
            quantity: i.cantidad,
            price: Number(i.product.precio),
            discount: i.descuento,
            vat: i.product.iva,
          })),
        )
      : null;
  } catch (e) {
    calcError = e instanceof Error ? e.message : "Importes inválidos";
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.cliente_id || !items.length) {
      setError("Cliente y al menos un ítem requeridos");
      return;
    }
    if (calcError) return;
    setBusy(true);
    setError("");
    try {
      const r = await check(
        await (db() as any).rpc("crear_factura_programada", {
          p_cliente: form.cliente_id,
          p_items: items.map((i) => ({
            id: i.product.id,
            cantidad: i.cantidad,
            descuento: i.descuento,
          })),
          p_metodo: form.metodo_pago,
          p_credito: form.credito_dias,
          p_periodicidad: form.periodicidad,
          p_dia_mes: form.periodicidad === "mensual" ? form.dia_mes : 0,
          p_dia_semana: form.periodicidad === "semanal" ? form.dia_semana : 0,
          p_inicio: form.inicio,
        }),
      );
      setMessage("Factura programada con IA creada (ID: " + r + ")");
      setShowForm(false);
      setItems([]);
      setForm({ ...form, cliente_id: "" });
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

  async function remove(row: ScheduledInvoice) {
    if (
      !window.confirm(
        `¿Eliminar la factura programada de ${clientName(row.cliente_id)}? Las facturas ya emitidas no se borran.`,
      )
    )
      return;
    setBusy(true);
    try {
      check(
        await (db() as any)
          .from("facturas_programadas")
          .delete()
          .eq("id", row.id),
      );
      setMessage("Factura programada eliminada.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    } finally {
      setBusy(false);
    }
  }

  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.nombre ?? id.slice(0, 8);

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FINANZAS / PROGRAMADAS</p>
          <h1>Facturas programadas con IA.</h1>
          <p>
            La IA agenda y emite tus facturas automáticamente (diario, semanal
            o mensual) con los ítems y precios de tu catálogo. Solo plan
            Luxury.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="pill pill-ia">
            <Sparkles size={13} /> Automatización con IA
          </span>
          <button className="button" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Ocultar" : "+ Nueva programada"}
          </button>
        </div>
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

          <div className="section-label">
            <h3>Ítems de la factura</h3>
            <small>{items.length} seleccionados</small>
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Buscar producto o servicio"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en tu catálogo por nombre o código…"
            />
          </div>
          {search && (
            <div className="product-list">
              {products
                .filter(
                  (p) =>
                    (p.nombre + p.codigo)
                      .toLowerCase()
                      .includes(search.toLowerCase()) &&
                    !items.some((i) => i.product.id === p.id),
                )
                .slice(0, 6)
                .map((p) => (
                  <button type="button" key={p.id} onClick={() => addItem(p)}>
                    <span className="product-icon">
                      {p.tipo === "EQUIPO" ? "▧" : "▣"}
                    </span>
                    <span>
                      <b>{p.nombre}</b>
                      <small>
                        {p.codigo} · IVA {p.iva}%
                      </small>
                    </span>
                    <span>
                      <b>{money(Number(p.precio))}</b>
                      <small>{p.tipo === "EQUIPO" ? "por día" : "unidad"}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                ))}
              {!products.filter((p) =>
                (p.nombre + p.codigo).toLowerCase().includes(search.toLowerCase()),
              ).length && <p className="muted">Sin coincidencias en tu catálogo.</p>}
            </div>
          )}

          <div className="item-table">
            {items.map((i) => (
              <div key={i.product.id} className="invoice-item">
                <div>
                  <b>{i.product.nombre}</b>
                  <small>
                    {money(Number(i.product.precio))} · IVA {i.product.iva}%
                  </small>
                </div>
                <input
                  aria-label={"Cantidad " + i.product.nombre}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={i.cantidad}
                  onChange={(e) =>
                    setItems((x) =>
                      x.map((v) =>
                        v.product.id === i.product.id
                          ? { ...v, cantidad: Number(e.target.value) }
                          : v,
                      ),
                    )
                  }
                />
                <label>
                  Descuento
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={i.descuento}
                    onChange={(e) =>
                      setItems((x) =>
                        x.map((v) =>
                          v.product.id === i.product.id
                            ? { ...v, descuento: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={"Quitar " + i.product.nombre}
                  onClick={() =>
                    setItems((x) => x.filter((v) => v.product.id !== i.product.id))
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          {!items.length && (
            <div className="empty-state">
              Busca productos o servicios y agrégalos a la factura.
            </div>
          )}
          {calcError && <p className="error">{calcError}</p>}
          {summary && (
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>
                  {money(
                    (summary.bases[0] + summary.bases[5] + summary.bases[15]) /
                      100,
                  )}
                </dd>
              </div>
              <div>
                <dt>IVA</dt>
                <dd>{money(summary.taxes / 100)}</dd>
              </div>
              <div className="grand-total">
                <dt>Total por emisión</dt>
                <dd>{money(summary.total / 100)}</dd>
              </div>
            </dl>
          )}

          <div className="field-pair">
            <label>Método de pago
              <select value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })}>
                <option value="01">Efectivo · 01</option>
                <option value="20">Transferencia · 20</option>
                <option value="16">Tarjeta de débito · 16</option>
                <option value="19">Tarjeta de crédito · 19</option>
                <option value="18">Tarjeta prepago · 18</option>
              </select>
            </label>
            <label>Crédito (días)
              <input type="number" min="0" max="365" value={form.credito_dias} onChange={(e) => setForm({ ...form, credito_dias: Number(e.target.value) })} />
            </label>
          </div>
          <div className="field-pair">
            <label>Periodicidad
              <select value={form.periodicidad} onChange={(e) => setForm({ ...form, periodicidad: e.target.value as any })}>
                <option value="diaria">Diaria</option>
                <option value="semanal">Semanal</option>
                <option value="mensual">Mensual</option>
              </select>
            </label>
            {form.periodicidad === "mensual" && (
              <label>Día del mes
                <select value={form.dia_mes} onChange={(e) => setForm({ ...form, dia_mes: Number(e.target.value) })}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>
            )}
            {form.periodicidad === "semanal" && (
              <label>Día de la semana
                <select value={form.dia_semana} onChange={(e) => setForm({ ...form, dia_semana: Number(e.target.value) })}>
                  {["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"].map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </label>
            )}
            <label>Fecha inicio
              <input type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} required />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="btn-ai"
              disabled={busy || !items.length || !!calcError}
              type="submit"
            >
              <Sparkles size={16} />
              {busy ? "Guardando…" : "Crear programada con IA"}
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
              <th>Ítems</th>
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
                <td>{r.cliente?.nombre ?? clientName(r.cliente_id)}</td>
                <td>{r.items?.length ?? 0}</td>
                <td>{r.proxima_fecha}</td>
                <td>{r.periodicidad}{r.periodicidad === "mensual" && r.dia_mes ? " (día " + r.dia_mes + ")" : ""}{r.periodicidad === "semanal" && r.dia_semana !== null ? " (" + ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][r.dia_semana] + ")" : ""}</td>
                <td>{METODOS[r.metodo_pago] ?? r.metodo_pago}</td>
                <td>
                  <span className="pill">{r.activa ? "Activa" : "Pausada"}</span>
                </td>
                <td>
                  <button className="secondary" onClick={() => void toggleActive(r)}>
                    {r.activa ? "Pausar" : "Activar"}
                  </button>{" "}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void remove(r)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty-state">No hay facturas programadas. Crea la primera con el botón de arriba.</div>}
      </div>
    </section>
  );
}
