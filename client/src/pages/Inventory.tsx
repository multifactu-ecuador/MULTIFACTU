import { useEffect, useState, type FormEvent } from "react";
import { Wand2 } from "lucide-react";
import { db, check, money } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  CATALOGO_SERVICIOS,
  OTRO_SERVICIO,
  sugerirCodigoServicio,
} from "../lib/serviceCatalog";
import type { Product } from "../lib/types";
export default function Inventory() {
  const { access } = useAuth();
  const [rows, setRows] = useState<Product[]>([]),
    [edit, setEdit] = useState<Product | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tipo, setTipo] = useState<Product["tipo"]>("EQUIPO"),
    [nombre, setNombre] = useState(""),
    [codigo, setCodigo] = useState("");
  async function load() {
    setRows(
      check(
        await db().from("catalogo_maquinaria").select("*").order("nombre"),
      ) ?? [],
    );
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  // Al cambiar de ítem (nuevo/edición) reinicia los campos controlados.
  useEffect(() => {
    setTipo(edit?.tipo ?? "EQUIPO");
    setNombre(edit?.nombre ?? "");
    setCodigo(edit?.codigo ?? "");
  }, [edit]);
  function pickService(servicio: string) {
    setNombre(servicio);
    if (!codigo || codigo.startsWith("SERV-")) setCodigo(sugerirCodigoServicio());
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const data = {
        tenant_id: access!.tenant_id,
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        tipo,
        estado: v.estado as Product["estado"],
        precio: Number(v.precio),
        costo: Number(v.costo),
        iva: Number(v.iva) as Product["iva"],
        // El stock sólo aplica a productos: servicios y equipos no lo descuentan.
        stock: tipo === "PRODUCTO" ? Number(v.stock) : 0,
      };
      check(
        edit
          ? await db()
              .from("catalogo_maquinaria")
              .update(data)
              .eq("id", edit.id)
          : await db().from("catalogo_maquinaria").insert(data),
      );
      setEdit(null);
      setNombre("");
      setCodigo("");
      setTipo("EQUIPO");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  async function remove(r: Product) {
    if (!window.confirm(`¿Eliminar "${r.nombre}" del catálogo?`)) return;
    setBusy(true);
    setError("");
    try {
      check(await db().from("catalogo_maquinaria").delete().eq("id", r.id));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg.includes("foreign key") || msg.includes("23503")
          ? "No se puede eliminar: este ítem ya tiene movimientos (facturas o alquileres registrados)."
          : msg || "No se pudo eliminar",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CATÁLOGO / TU EMPRESA</p>
          <h1>Inventario y productos.</h1>
          <p>Equipos, productos y servicios con sus propias tarifas.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {access?.rol === "ADMIN" && (
        <form
          className="card editor-grid"
          onSubmit={save}
          key={edit?.id ?? "new"}
        >
          <h2>{edit ? "Editar ítem" : "Crear ítem"}</h2>
          <label>
            Tipo
            <select
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Product["tipo"])}
            >
              <option>EQUIPO</option>
              <option>PRODUCTO</option>
              <option>SERVICIO</option>
            </select>
          </label>
          {tipo === "SERVICIO" && (
            <div className="service-cat">
              <p className="eyebrow">
                <Wand2 size={12} /> Catálogo recomendado por sectores · descripciones
                válidas para el SRI
              </p>
              <div className="service-cat-grid">
                {CATALOGO_SERVICIOS.map((s) => (
                  <details key={s.sector}>
                    <summary>{s.sector}</summary>
                    <div className="service-cat-items">
                      {s.servicios.map((serv) => (
                        <button
                          type="button"
                          key={serv}
                          onClick={() => pickService(serv)}
                        >
                          {serv}
                        </button>
                      ))}
                    </div>
                  </details>
                ))}
                <button
                  type="button"
                  className="service-cat-other"
                  onClick={() => {
                    setNombre("");
                    if (!codigo || codigo.startsWith("SERV-"))
                      setCodigo(sugerirCodigoServicio());
                    document
                      .getElementById("inventory-nombre")
                      ?.focus();
                  }}
                >
                  ✏️ {OTRO_SERVICIO}
                </button>
              </div>
              <small>
                Elige una descripción o escribe la tuya: ese texto viaja a la
                factura como detalle del comprobante.
              </small>
            </div>
          )}
          <label>
            Código
            <input
              name="codigo"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label>
            Nombre
            <input
              id="inventory-nombre"
              name="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label>
            Estado
            <select name="estado" defaultValue={edit?.estado ?? "Disponible"}>
              <option>Disponible</option>
              <option>Alquilado</option>
              <option>Mantenimiento</option>
            </select>
          </label>
          <label>
            Precio ($; equipo por día)
            <input
              name="precio"
              type="number"
              min="0"
              step="0.01"
              defaultValue={edit?.precio ?? 30}
              required
            />
          </label>
          <label>
            Costo ($)
            <input
              name="costo"
              type="number"
              min="0"
              step="0.01"
              defaultValue={edit?.costo ?? 0}
              required
            />
          </label>
          <label>
            IVA
            <select name="iva" defaultValue={edit?.iva ?? 15}>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="15">15%</option>
            </select>
          </label>
          {tipo === "PRODUCTO" && (
            <label>
              Stock (se descuenta al facturar)
              <input
                name="stock"
                type="number"
                min="0"
                step="0.001"
                defaultValue={edit?.stock ?? 0}
                required
              />
            </label>
          )}
          {tipo !== "PRODUCTO" && (
            <small className="muted">
              {tipo === "SERVICIO"
                ? "Los servicios no manejan stock: nunca se descuenta inventario al facturarlos."
                : "Los equipos se controlan por estado y reservas de alquiler, no por stock."}
            </small>
          )}
          <button disabled={busy}>
            {busy ? "Guardando…" : "Guardar ítem"}
          </button>
          {edit && (
            <button
              type="button"
              className="secondary"
              onClick={() => setEdit(null)}
            >
              Cancelar edición
            </button>
          )}
        </form>
      )}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ítem</th>
              <th>Tipo / estado</th>
              <th>Precio</th>
              <th>IVA</th>
              <th>Stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.nombre}</b>
                  <small>{r.codigo}</small>
                </td>
                <td>
                  {r.tipo}
                  <small>{r.estado}</small>
                </td>
                <td>{money(Number(r.precio))}</td>
                <td>{r.iva}%</td>
                <td>{r.tipo === "PRODUCTO" ? r.stock : "—"}</td>
                <td>
                  {access?.rol === "ADMIN" && (
                    <>
                      <button className="secondary" onClick={() => setEdit(r)}>
                        Editar
                      </button>{" "}
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void remove(r)}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">
            Tu catálogo empieza aquí. Agrega un equipo, producto o servicio.
          </div>
        )}
      </div>
    </section>
  );
}
