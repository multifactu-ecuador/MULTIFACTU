import { useEffect, useState } from "react";
import { Plus, Search, Trash2, Copy, Share2, Ban } from "lucide-react";
import { db, check, money } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { preview } from "../../../shared/fiscal.ts";
import type { Client, Product } from "../lib/types";

interface Proforma {
  id: string;
  numero: number;
  cliente_id: string;
  token_publico: string;
  estado: "Enviada" | "Aprobada" | "Rechazada" | "Anulada";
  valida_hasta: string;
  total: number;
  factura_id: string | null;
  creado_en: string;
}

interface FormItem {
  product: Product;
  cantidad: number;
  descuento: number;
}

const quoteLink = (token: string) =>
  `${window.location.origin}/cotizacion/${token}`;

export default function Proformas() {
  const { access } = useAuth();
  const [rows, setRows] = useState<Proforma[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showForm, setShowForm] = useState(false),
    [search, setSearch] = useState(""),
    [clienteId, setClienteId] = useState(""),
    [validez, setValidez] = useState(15),
    [metodo, setMetodo] = useState("20"),
    [credito, setCredito] = useState(0),
    [items, setItems] = useState<FormItem[]>([]);

  async function load() {
    try {
      const [p, c, pr] = await Promise.all([
        (db() as any)
          .from("proformas")
          .select("*")
          .order("creado_en", { ascending: false }),
        db().from("clientes").select("*").order("nombre"),
        db().from("catalogo_maquinaria").select("*").order("nombre"),
      ]);
      if (!p.error) setRows((p.data as Proforma[]) ?? []);
      if (!c.error) setClients((c.data as Client[]) ?? []);
      if (!pr.error) setProducts((pr.data as Product[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    }
  }
  useEffect(() => {
    void load();
  }, []);

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
    if (!clienteId || !items.length) {
      setError("Cliente y al menos un ítem requeridos");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = (await check(
        await (db() as any).rpc("crear_proforma", {
          p_cliente: clienteId,
          p_items: items.map((i) => ({
            id: i.product.id,
            cantidad: i.cantidad,
            descuento: i.descuento,
          })),
          p_metodo: metodo,
          p_credito_dias: credito,
          p_validez_dias: validez,
        }),
      )) as { id: string; numero: number; token: string };
      const link = quoteLink(r.token);
      try {
        await navigator.clipboard.writeText(link);
        setMessage(
          `Cotización #${r.numero} creada y enlace copiado: envíalo a tu cliente para que la apruebe desde su teléfono.`,
        );
      } catch {
        setMessage(`Cotización #${r.numero} creada. Enlace: ${link}`);
      }
      setShowForm(false);
      setItems([]);
      setClienteId("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(p: Proforma) {
    try {
      await navigator.clipboard.writeText(quoteLink(p.token_publico));
      setMessage(`Enlace de la cotización #${p.numero} copiado.`);
    } catch {
      setError("No se pudo copiar: " + quoteLink(p.token_publico));
    }
  }

  async function annul(p: Proforma) {
    setBusy(true);
    try {
      check(await (db() as any).rpc("anular_proforma", { p_id: p.id }));
      setMessage(`Cotización #${p.numero} anulada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular");
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
          <p className="eyebrow">VENTAS / COTIZACIONES</p>
          <h1>Proformas que se aprueban solas.</h1>
          <p>
            Envía el enlace a tu cliente: lo abre en su teléfono, revisa y
            aprueba. Al aprobar, la factura se emite automáticamente sin volver
            a digitar nada.
          </p>
        </div>
        <button className="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Ocultar" : "+ Nueva cotización"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}

      {showForm && (
        <form className="card" style={{ display: "grid", gap: "12px" }} onSubmit={submit}>
          <h2>Nueva cotización</h2>
          <label>Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <div className="section-label">
            <h3>Ítems cotizados</h3>
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
                    (p.nombre + p.codigo).toLowerCase().includes(search.toLowerCase()) &&
                    !items.some((i) => i.product.id === p.id),
                )
                .slice(0, 6)
                .map((p) => (
                  <button type="button" key={p.id} onClick={() => addItem(p)}>
                    <span className="product-icon">{p.tipo === "EQUIPO" ? "▧" : "▣"}</span>
                    <span>
                      <b>{p.nombre}</b>
                      <small>{p.codigo} · IVA {p.iva}%</small>
                    </span>
                    <span>
                      <b>{money(Number(p.precio))}</b>
                      <small>{p.tipo === "EQUIPO" ? "por día" : "unidad"}</small>
                    </span>
                    <Plus size={16} />
                  </button>
                ))}
            </div>
          )}
          <div className="item-table">
            {items.map((i) => (
              <div key={i.product.id} className="invoice-item">
                <div>
                  <b>{i.product.nombre}</b>
                  <small>{money(Number(i.product.precio))} · IVA {i.product.iva}%</small>
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
                  onClick={() => setItems((x) => x.filter((v) => v.product.id !== i.product.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          {!items.length && (
            <div className="empty-state">Busca ítems de tu catálogo y agrégalos a la cotización.</div>
          )}
          {calcError && <p className="error">{calcError}</p>}
          {summary && (
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{money((summary.bases[0] + summary.bases[5] + summary.bases[15]) / 100)}</dd>
              </div>
              <div>
                <dt>IVA</dt>
                <dd>{money(summary.taxes / 100)}</dd>
              </div>
              <div className="grand-total">
                <dt>Total cotizado</dt>
                <dd>{money(summary.total / 100)}</dd>
              </div>
            </dl>
          )}
          <div className="field-pair">
            <label>Método de pago
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                <option value="01">Efectivo · 01</option>
                <option value="20">Transferencia · 20</option>
                <option value="16">Tarjeta de débito · 16</option>
                <option value="19">Tarjeta de crédito · 19</option>
                <option value="18">Tarjeta prepago · 18</option>
              </select>
            </label>
            <label>Crédito (días)
              <input type="number" min="0" max="365" value={credito} onChange={(e) => setCredito(Number(e.target.value))} />
            </label>
            <label>Vigencia (días)
              <input type="number" min="1" max="90" value={validez} onChange={(e) => setValidez(Number(e.target.value))} required />
            </label>
          </div>
          <div className="form-actions">
            <button disabled={busy || !items.length || !!calcError} type="submit">
              {busy ? "Creando…" : "Crear y copiar enlace"}
            </button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Cliente</th>
              <th>Total</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th>Compartir</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.numero}</td>
                <td>{clientName(p.cliente_id)}</td>
                <td>{money(Number(p.total))}</td>
                <td>{p.valida_hasta}</td>
                <td>
                  <span className={p.estado === "Aprobada" ? "pill pill-real" : "pill"}>
                    {p.estado}
                    {p.estado === "Aprobada" && p.factura_id ? " · facturada" : ""}
                  </span>
                </td>
                <td>
                  {p.estado === "Enviada" && (
                    <>
                      <button className="secondary" onClick={() => void copyLink(p)} title="Copiar enlace">
                        <Copy size={14} /> Enlace
                      </button>{" "}
                      <a
                        className="secondary"
                        style={{ textDecoration: "none" }}
                        target="_blank"
                        rel="noreferrer"
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `Hola, le comparto la cotización #${p.numero} de ${access?.empresa.nombre ?? "MULTIFACTU"} por ${money(Number(p.total))}. Revísela y apruébela aquí: ${quoteLink(p.token_publico)}`,
                        )}`}
                      >
                        <Share2 size={14} /> WhatsApp
                      </a>
                    </>
                  )}
                </td>
                <td>
                  {p.estado === "Enviada" && access?.rol === "ADMIN" && (
                    <button className="secondary" onClick={() => void annul(p)} disabled={busy}>
                      <Ban size={14} /> Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">
            Aún no hay cotizaciones. Crea la primera y comparte el enlace con tu cliente.
          </div>
        )}
      </div>
    </section>
  );
}
