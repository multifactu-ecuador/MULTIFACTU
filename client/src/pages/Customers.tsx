import { useEffect, useState, type FormEvent } from "react";
import { db, check } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { validarIdentificacion } from "../../../shared/identity.ts";
import type { Client } from "../lib/types";
export default function Customers() {
  const { access } = useAuth();
  const [rows, setRows] = useState<Client[]>([]),
    [edit, setEdit] = useState<Client | null>(null),
    [error, setError] = useState("");
  const load = async () =>
    setRows(
      check(await db().from("clientes").select("*").order("nombre")) ?? [],
    );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      v = Object.fromEntries(new FormData(form));
    setError("");
    try {
      const type = v.tipo_id as Client["tipo_id"];
      if (!validarIdentificacion(type, String(v.identificacion)).valid)
        throw Error("Cédula/RUC inválidos");
      const row = {
        tenant_id: access!.tenant_id,
        tipo_id: type,
        identificacion: String(v.identificacion),
        nombre: String(v.nombre),
        email: String(v.email),
        direccion: String(v.direccion),
      };
      check(
        edit
          ? await db().from("clientes").update(row).eq("id", edit.id)
          : await db().from("clientes").insert(row),
      );
      form.reset();
      setEdit(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }
  async function remove(c: Client) {
    if (
      !window.confirm(
        `¿Eliminar al cliente "${c.nombre}"? Si tiene deuda pendiente el sistema lo impedirá.`,
      )
    )
      return;
    setError("");
    try {
      check(await (db() as any).rpc("eliminar_cliente", { p_id: c.id }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar");
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RELACIONES / DATOS FISCALES</p>
          <h1>Clientes.</h1>
          <p>Identificación, contacto e información de tu negocio.</p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form
        className="card editor-grid"
        onSubmit={save}
        key={edit?.id ?? "new"}
      >
        <h2>{edit ? "Editar cliente" : "Crear cliente"}</h2>
        <label>
          Tipo
          <select name="tipo_id" defaultValue={edit?.tipo_id ?? "04"}>
            <option value="04">RUC</option>
            <option value="05">Cédula</option>
          </select>
        </label>
        <label>
          Cédula o RUC
          <input
            name="identificacion"
            inputMode="numeric"
            maxLength={13}
            defaultValue={edit?.identificacion}
            required
          />
        </label>
        <label>
          Nombre / razón social
          <input
            name="nombre"
            defaultValue={edit?.nombre}
            required
            minLength={2}
            maxLength={160}
          />
        </label>
        <label>
          Correo
          <input
            name="email"
            type="email"
            maxLength={160}
            defaultValue={edit?.email}
          />
        </label>
        <label>
          Dirección
          <input
            name="direccion"
            maxLength={200}
            defaultValue={edit?.direccion}
          />
        </label>
        <button>Guardar cliente</button>
        {edit && (
          <button
            className="secondary"
            type="button"
            onClick={() => setEdit(null)}
          >
            Cancelar
          </button>
        )}
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Identificación</th>
              <th>Correo</th>
              <th>Dirección</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>{c.identificacion}</td>
                <td>{c.email}</td>
                <td>{c.direccion}</td>
                <td>
                  {c.tipo_id !== "07" && access?.rol === "ADMIN" && (
                    <>
                      <button className="secondary" onClick={() => setEdit(c)}>
                        Editar
                      </button>{" "}
                      <button
                        className="secondary"
                        onClick={() => void remove(c)}
                        title="Eliminar (bloqueado si tiene deuda)"
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
      </div>
    </section>
  );
}
