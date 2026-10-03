import { useEffect, useState, type FormEvent } from "react";
import { db, check, money } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type { Product } from "../lib/types";
export default function Inventory() {
  const { access } = useAuth();
  const [rows, setRows] = useState<Product[]>([]),
    [edit, setEdit] = useState<Product | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const data = {
        tenant_id: access!.tenant_id,
        codigo: String(v.codigo),
        nombre: String(v.nombre),
        tipo: v.tipo as Product["tipo"],
        estado: v.estado as Product["estado"],
        precio: Number(v.precio),
        costo: Number(v.costo),
        iva: Number(v.iva) as Product["iva"],
        stock: Number(v.stock),
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
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
            Código
            <input name="codigo" defaultValue={edit?.codigo} required />
          </label>
          <label>
            Nombre
            <input name="nombre" defaultValue={edit?.nombre} required />
          </label>
          <label>
            Tipo
            <select name="tipo" defaultValue={edit?.tipo ?? "EQUIPO"}>
              <option>EQUIPO</option>
              <option>PRODUCTO</option>
              <option>SERVICIO</option>
            </select>
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
          <label>
            Stock (productos)
            <input
              name="stock"
              type="number"
              min="0"
              step="0.001"
              defaultValue={edit?.stock ?? 0}
              required
            />
          </label>
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
                <td>{r.stock}</td>
                <td>
                  {access?.rol === "ADMIN" && (
                    <button className="secondary" onClick={() => setEdit(r)}>
                      Editar
                    </button>
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
