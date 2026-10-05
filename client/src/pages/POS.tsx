import { useEffect, useState, useRef, useCallback } from "react";
import { Search, Plus, Trash2, ArrowUpRight } from "lucide-react";
import { db, check, money, today, sriRealListo } from "../lib/supabase";
import type {
  Client,
  Product,
  Rental,
  RentalLine,
  Invoice,
} from "../lib/types";
import { preview, rentalDays } from "../../../shared/fiscal.ts";
import { validarIdentificacion } from "../../../shared/identity.ts";
import { useAuth } from "../auth/AuthContext";
interface Item {
  product: Product;
  quantity: number;
  discount: number;
}
export default function POS({ rental = false }: { rental?: boolean }) {
  const { access } = useAuth();
  const [products, setProducts] = useState<Product[]>([]),
    [clients, setClients] = useState<Client[]>([]),
    [contracts, setContracts] = useState<Rental[]>([]),
    [rentalLines, setRentalLines] = useState<RentalLine[]>([]),
    [customer, setCustomer] = useState<Client | null>(null),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [items, setItems] = useState<Item[]>([]);
  const [start, setStart] = useState(today() + "T08:00"),
    [end, setEnd] = useState(today() + "T18:00"),
    [deposit, setDeposit] = useState("0"),
  [rentalMode, setRentalMode] = useState<"FACTURA" | "VENTA_INTERNA">("FACTURA"),
    [method, setMethod] = useState("20"),
    [credit, setCredit] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [job, setJob] = useState<Invoice | null>(null),
    [rentalJob, setRentalJob] = useState<string | null>(null),
    [quick, setQuick] = useState(false);
  const token = useRef({ payload: "", id: "" });
  useEffect(() => {
    let live = true;
    void Promise.all([
      db().from("catalogo_maquinaria").select("*").order("nombre"),
      db().from("clientes").select("*").order("nombre"),
      rental
        ? db().from("contratos_alquiler").select("*").eq("estado", "ACTIVO")
        : Promise.resolve({ data: [] as Rental[], error: null }),
      rental
        ? db().from("contratos_detalles").select("*")
        : Promise.resolve({ data: [] as RentalLine[], error: null }),
    ])
      .then(([p, c, a, d]) => {
        if (!live) return;
        setProducts(check(p) ?? []);
        const cs = check(c) ?? [];
        setClients(cs);
        setCustomer(cs.find((x) => x.tipo_id === "07") ?? null);
        setContracts(check(a) ?? []);
        setRentalLines(check(d) ?? []);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [rental]);
  useEffect(() => {
    if (!job || ["Autorizada", "Error"].includes(job.estado)) return;
    let live = true;
    const timer = setInterval(() => {
      void db()
        .from("facturas_sri")
        .select("*")
        .eq("id", job.id)
        .single()
        .then((r) => {
          if (live && !r.error) setJob(r.data);
        });
    }, 1500);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.estado]);
  const iso = (value: string) => value + ":00-05:00";
  let days = 1,
    periodError = "";
  try {
    if (rental) days = rentalDays(iso(start), iso(end));
  } catch (e) {
    periodError = e instanceof Error ? e.message : "Período inválido";
  }
  const unavailable = (p: Product) =>
    p.tipo === "EQUIPO" &&
    (p.estado !== "Disponible" ||
      rentalLines.some(
        (l) =>
          l.equipo_id === p.id &&
          contracts.some(
            (c) =>
              c.id === l.contrato_id &&
              Date.parse(c.salida) < Date.parse(iso(end)) &&
              Date.parse(c.retorno) > Date.parse(iso(start)),
          ),
      ));
  let summary: ReturnType<typeof preview> | null = null,
    calcError = "";
  try {
    summary = preview(
      items.map((i) => ({
        quantity: i.quantity,
        price:
          Number(i.product.precio) * (i.product.tipo === "EQUIPO" ? days : 1),
        discount: i.discount,
        vat: i.product.iva,
      })),
    );
  } catch (e) {
    calcError = e instanceof Error ? e.message : "Importes inválidos";
  }
  const add = (p: Product) => {
    if (!items.some((i) => i.product.id === p.id))
      setItems((x) => [...x, { product: p, quantity: 1, discount: 0 }]);
  };
  const emit = useCallback(async () => {
    if (busy || !customer || !items.length || periodError || calcError) return;
    setBusy(true);
    setError("");
    try {
      if (
        !validarIdentificacion(customer.tipo_id, customer.identificacion).valid
      )
        throw Error("Identificación del cliente inválida");
      const payload = {
        p_cliente: customer.id,
        p_items: items.map((i) => ({
          id: i.product.id,
          cantidad: i.quantity,
          descuento: i.discount,
        })),
        p_metodo: method,
        p_credito_dias: credit,
        p_tipo: rental ? "ALQUILER" : "VENTA",
        p_salida: rental ? iso(start) : null,
        p_retorno: rental ? iso(end) : null,
        p_garantia: rental ? Number(deposit) : 0,
      };
      const serialized = JSON.stringify(payload);
      if (token.current.payload !== serialized)
        token.current = { payload: serialized, id: crypto.randomUUID() };
      if (rental && rentalMode === "VENTA_INTERNA") {
        const contractId = check(
          await db().rpc("registrar_alquiler_interno", {
            p_cliente: customer.id,
            p_items: payload.p_items,
            p_metodo: method,
            p_salida: iso(start),
            p_retorno: iso(end),
            p_garantia: Number(deposit),
            p_token: token.current.id,
          }),
        );
        if (!contractId) throw Error("No se creó el contrato");
        setJob(null);
        setRentalJob(contractId);
        setRentalLines([]);
        setItems([]);
        return;
      }
      const id = check(
        await db().rpc("crear_factura", {
          ...payload,
          p_token: token.current.id,
        }),
      );
      if (!id) throw Error("No se devolvió la factura");
      const invoice = check(
        await db().from("facturas_sri").select("*").eq("id", id).single(),
      );
      setJob(invoice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    customer,
    items,
    method,
    credit,
    rental,
    start,
    end,
    deposit,
    periodError,
    calcError,
  ]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        void emit();
      }
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [emit]);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            OPERACIONES / {rental ? "ALQUILER" : "VENTAS"}
          </p>
          <h1>{rental ? "Tu próximo alquiler." : "Tu próxima venta."}</h1>
          <p>
            Cliente, {rental ? "equipos y fechas" : "productos y servicios"} en
            una sola operación.
          </p>
        </div>
        {access && sriRealListo(access.empresa) ? (
          <span className="pill pill-real">FACTURACIÓN REAL</span>
        ) : (
          <span className="pill">Demostración SRI</span>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="pos-columns">
        <section className="card">
          <h2>Configura la operación</h2>
          <label>
            Cliente · nombre, cédula o RUC
            <div className="search-field">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente…"
              />
            </div>
          </label>
          {query && (
            <div className="customer-results">
              {clients
                .filter((c) =>
                  (c.nombre + c.identificacion)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .slice(0, 5)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCustomer(c);
                      setQuery("");
                    }}
                  >
                    {c.nombre}
                    <small>{c.identificacion}</small>
                  </button>
                ))}
            </div>
          )}
          <div className="selected-client">
            <b>{customer?.nombre ?? "Selecciona un cliente"}</b>
            <small>{customer?.identificacion}</small>
          </div>
          <p>
            <button
              type="button"
              className="button light"
              onClick={() => setQuick((v) => !v)}
            >
              {quick ? "Cancelar" : "+ Nuevo cliente"}
            </button>
          </p>
          {quick && (
            <form
              className="card"
              style={{ display: "grid", gap: "8px" }}
              onSubmit={(e) => {
                e.preventDefault();
                const v = new FormData(e.currentTarget);
                void (async () => {
                  const ident = String(v.get("identificacion") || "").trim();
                  const nombre = String(v.get("nombre") || "").trim();
                  const tipo = String(v.get("tipo") || "04");
                  if (!/^\d{10}$|^\d{13}$/.test(ident) || !nombre)
                    throw Error("Cédula/RUC y nombre válidos requeridos");
                  const { data, error } = await db()
                    .from("clientes")
                    .insert({
                      tenant_id: access!.tenant_id,
                      tipo_id: tipo,
                      identificacion: ident,
                      nombre,
                      email: String(v.get("email") || ""),
                      direccion: String(v.get("direccion") || ""),
                    } as any)
                    .select("*")
                    .single();
                  if (error) throw error;
                  const cli = (data as Client) ?? null;
                  setClients((x) => [...x, cli as Client]);
                  setCustomer(cli as Client);
                  setQuick(false);
                })().catch((e) => setError(e.message));
              }}
            >
              <label>
                Tipo
                <select name="tipo" defaultValue="05">
                  <option value="05">Cédula</option>
                  <option value="04">RUC</option>
                  <option value="07">Consumidor final</option>
                </select>
              </label>
              <label>Identificación <input name="identificacion" required inputMode="numeric" /></label>
              <label>Nombre <input name="nombre" required /></label>
              <label>Email <input name="email" type="email" /></label>
              <label>Dirección <input name="direccion" /></label>
              <button disabled={busy}>Guardar y usar</button>
            </form>
          )}
          {rental && (
            <>
              <div className="field-pair">
                <label>
                  Fecha/hora de entrega
                  <input
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Fecha/hora de devolución
                  <input
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              <p className="rental-period">
                {periodError ||
                  `${days} día${days === 1 ? "" : "s"} · períodos iniciados de 24 horas · Ecuador`}
              </p>
              <div className="rental-mode">
                <label>
                  Tipo de venta del alquiler
                  <select
                    value={rentalMode}
                    onChange={(e) =>
                      setRentalMode(
                        e.target.value as "FACTURA" | "VENTA_INTERNA",
                      )
                    }
                  >
                    <option value="FACTURA">Factura (comprobante electrónico)</option>
                    <option value="VENTA_INTERNA">Venta interna (sin factura)</option>
                  </select>
                </label>
                <small className="fieldhint">
                  Ambos crean contrato de alquiler · {rentalMode === "FACTURA"
                    ? "Facturado al SRI si tu empresa tiene validez"
                    : "Ingresa directo a caja como venta interna"}
                </small>
              </div>
            </>
          )}
          <div className="section-label">
            <h3>{rental ? "Maquinaria y equipos" : "Catálogo"}</h3>
            <small>{products.length} ítems</small>
          </div>
          <input
            aria-label="Buscar producto o equipo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código"
          />
          <div className="product-list">
            {products
              .filter(
                (p) =>
                  (rental ? p.tipo === "EQUIPO" : p.tipo !== "EQUIPO") &&
                  (p.nombre + p.codigo)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((p) => (
                <button
                  disabled={
                    unavailable(p) || items.some((i) => i.product.id === p.id)
                  }
                  key={p.id}
                  onClick={() => add(p)}
                >
                  <span className="product-icon">
                    {p.tipo === "EQUIPO" ? "▧" : "▣"}
                  </span>
                  <span>
                    <b>{p.nombre}</b>
                    <small>
                      {p.codigo} ·{" "}
                      {unavailable(p) ? "En uso / mantenimiento" : "Disponible"}
                    </small>
                  </span>
                  <span>
                    <b>{money(Number(p.precio))}</b>
                    <small>
                      {rental
                        ? "por día"
                        : p.tipo === "PRODUCTO"
                          ? `Stock ${p.stock}`
                          : "Servicio"}
                    </small>
                  </span>
                  <Plus size={16} />
                </button>
              ))}
          </div>
          {!products.length && (
            <p className="muted">
              Crea tu catálogo en Inventario y productos para comenzar.
            </p>
          )}
          {rental && (
            <div className="additional-services">
              <h3>Servicios adicionales</h3>
              {products
                .filter((p) => p.tipo === "SERVICIO")
                .map((p) => (
                  <label className="checkbox" key={p.id}>
                    <input
                      type="checkbox"
                      checked={items.some((i) => i.product.id === p.id)}
                      onChange={(e) =>
                        e.target.checked
                          ? add(p)
                          : setItems((x) =>
                              x.filter((i) => i.product.id !== p.id),
                            )
                      }
                    />
                    <span>
                      {p.nombre} · {money(Number(p.precio))}
                    </span>
                  </label>
                ))}
              <small>
                Transporte, operador y mantenimiento se configuran como
                servicios de tu catálogo.
              </small>
            </div>
          )}
        </section>
        <section className="card invoice-card">
          <div className="section-label">
            <h2>Detalle del comprobante</h2>
            <ReceiptBadge />
          </div>
          <div className="item-table">
            {items.map((i) => (
              <div key={i.product.id} className="invoice-item">
                <div>
                  <b>
                    {i.product.tipo === "EQUIPO"
                      ? `Alquiler ${i.product.nombre} · ${days} días [${start.slice(0, 10)} — ${end.slice(0, 10)}]`
                      : i.product.nombre}
                  </b>
                  <small>IVA {i.product.iva}%</small>
                </div>
                <input
                  aria-label={"Cantidad " + i.product.nombre}
                  type="number"
                  min="0.001"
                  step="0.001"
                  disabled={false}
                  value={i.quantity}
                  onChange={(e) =>
                    setItems((x) =>
                      x.map((v) =>
                        v.product.id === i.product.id
                          ? { ...v, quantity: Number(e.target.value) }
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
                    value={i.discount}
                    onChange={(e) =>
                      setItems((x) =>
                        x.map((v) =>
                          v.product.id === i.product.id
                            ? { ...v, discount: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  aria-label={"Quitar " + i.product.nombre}
                  onClick={() =>
                    setItems((x) =>
                      x.filter((v) => v.product.id !== i.product.id),
                    )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          {!items.length && (
            <div className="empty-state">
              Agrega ítems para preparar el comprobante.
            </div>
          )}
          {summary && (
            <dl className="totals">
              {([0, 5, 15] as const).map((v) => (
                <div key={v}>
                  <dt>Subtotal {v}%</dt>
                  <dd>{money(summary!.bases[v] / 100)}</dd>
                </div>
              ))}
              <div>
                <dt>Descuentos aplicados</dt>
                <dd>{money(summary.discount / 100)}</dd>
              </div>
              <div>
                <dt>IVA total</dt>
                <dd>{money(summary.taxes / 100)}</dd>
              </div>
              <div className="grand-total">
                <dt>VALOR TOTAL DE LA FACTURA</dt>
                <dd>{money(summary.total / 100)}</dd>
              </div>
            </dl>
          )}
          {rental && (
            <label className="deposit-field">
              Depósito en garantía ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
              />
              <small>
                Separado del subtotal y del IVA. No acredita un cobro en caja.
              </small>
            </label>
          )}
          <label>
            Forma de pago
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="01">Efectivo · 01</option>
              <option value="20">
                Transferencia / sistema financiero · 20
              </option>
              <option value="16">Tarjeta de débito · 16</option>
              <option value="19">Tarjeta de crédito · 19</option>
              <option value="18">Tarjeta prepago · 18</option>
            </select>
          </label>
          <label>
            Crédito / plazo (días; Luxury)
            <input
              type="number"
              min="0"
              max="365"
              value={credit}
              onChange={(e) => setCredit(Number(e.target.value))}
            />
            <small>
              0 = contado. PostgreSQL exige Luxury para conceder crédito.
            </small>
          </label>
          {(calcError || periodError) && (
            <p className="error">{calcError || periodError}</p>
          )}
          <button
            className="emit-button"
            disabled={busy || !items.length || !!calcError || !!periodError}
            onClick={() => void emit()}
          >
            {busy
              ? "Guardando…"
              : rental && rentalMode === "VENTA_INTERNA"
                ? "Emitir orden de venta y contrato"
                : "Emitir factura de demostración"}
            <ArrowUpRight size={17} />
          </button>
          <small>
            Ctrl + Enter · precios y disponibilidad verificados por PostgreSQL.
          </small>
        </section>
      </div>
      {rentalJob && (
        <div className="modal-backdrop">
          <section className="emission-modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              onClick={() => setRentalJob(null)}
              aria-label="Cerrar"
            >
              ×
            </button>
            <p className="eyebrow">
              {rental
                ? rentalMode === "VENTA_INTERNA"
                  ? "ORDEN DE VENTA · CONTRATO"
                  : "ALQUILER · FACTURA"
                : "VENTA"}
            </p>
            <h2>Contrato registrado</h2>
            <p className="notice">
              {rentalMode === "VENTA_INTERNA"
                ? `Orden de venta creada (#${rentalJob?.slice(0, 8)}). Contrato de alquiler activo correspondiente y el ingreso ya está en caja.`
                : `Contrato de alquiler creado (#${rentalJob?.slice(0, 8)}). El ingreso fue registrado en caja como venta interna.`}
            </p>
          </section>
        </div>
      )}
      {job && (
        <div className="modal-backdrop">
          <section
            className="emission-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Estado de emisión"
          >
            <button
              className="modal-close"
              onClick={() => setJob(null)}
              aria-label="Cerrar estado"
            >
              ×
            </button>
            <p className="eyebrow">FLUJO DE DEMOSTRACIÓN</p>
            <h2>
              {job.estado === "Autorizada"
                ? "Simulación completada"
                : job.estado === "Error"
                  ? "Revisión requerida"
                  : "Comprobante en proceso"}
            </h2>
            <ol>
              {[
                "XML creado",
                "Firma simulada",
                "Recepción simulada",
                "Autorización simulada",
              ].map((v, i) => (
                <li
                  className={
                    job.estado === "Autorizada" || i === 0 ? "complete" : ""
                  }
                  key={v}
                >
                  <span>{i + 1}</span>
                  {v}
                </li>
              ))}
            </ol>
            <p>
              {job.mensaje ??
                "Pendiente del Database Webhook. Configura la Edge Function para continuar."}
            </p>
            <small>
              No es una firma XAdES-BES ni una autorización real del SRI.
            </small>
            <button onClick={() => setJob(null)}>Volver a la operación</button>
          </section>
        </div>
      )}
    </section>
  );
}
function ReceiptBadge() {
  return <span className="pill">XML · SRI</span>;
}
