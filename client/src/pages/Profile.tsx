import { useState, type FormEvent } from "react";
import { db, check } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
export default function Profile() {
  const { access, refresh, allowed } = useAuth();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [personalName, setPersonalName] = useState(access?.nombre ?? "");
  const e = access!.empresa;
  const editable = access?.rol === "ADMIN" && allowed("facturacion");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      check(
        await db()
          .from("empresas")
          .update({
            nombre: String(form.get("nombre")),
            razon_social: String(form.get("razon_social")),
            ruc: String(form.get("ruc")) || null,
            direccion: String(form.get("direccion")),
            regimen: String(form.get("regimen")) as "general" | "rimpe_emprendedor" | "rimpe_negocio_popular",
            obligado_contabilidad: form.get("obligado_contabilidad") === "on",
          })
          .eq("id", access!.tenant_id),
      );
      if (personalName.trim() && personalName.trim() !== access!.nombre) {
        const sess = (await db().auth.getSession()).data.session;
        if (sess)
          check(
            await (db() as any)
              .from("usuarios_perfiles")
              .update({ nombre: personalName.trim() })
              .eq("id", sess.user.id),
          );
      }
      await refresh();
      setMessage("Información empresarial actualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }
  async function upload(
    file: File | undefined,
    kind: "certificados" | "logos",
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "certificados" && !file.name.toLowerCase().endsWith(".p12"))
        throw Error("Selecciona un archivo .p12");
      if (kind === "logos" && !["image/png", "image/jpeg"].includes(file.type))
        throw Error("El logo debe ser PNG o JPEG");
      const path =
        access!.tenant_id +
        "/" +
        crypto.randomUUID() +
        (kind === "certificados"
          ? ".p12"
          : file.type === "image/png"
            ? ".png"
            : ".jpg");
      check(
        await db().storage.from(kind).upload(path, file, { upsert: false }),
      );
      try {
        check(
          await db()
            .from("empresas")
            .update(
              kind === "certificados"
                ? { ruta_p12: path }
                : { logo_path: path },
            )
            .eq("id", access!.tenant_id),
        );
      } catch (e) {
        await db().storage.from(kind).remove([path]);
        throw e;
      }
      await refresh();
      setMessage("Archivo guardado en un bucket privado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURACIÓN / TU IDENTIDAD</p>
          <h1>Perfil de mi empresa.</h1>
          <p>Datos del negocio y archivos privados separados por empresa.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="card sri-card">
        <header className="sri-card-head">
          <span className="sri-mark">C</span>
          <h2>Integración con el SRI</h2>
        </header>
        <div className="sri-card-body">
          <p className="sri-ruc">
            {e.ruc ?? "Sin RUC configurado"}
            <br />
            <small>{e.razon_social}</small>
          </p>
          <ul className="sri-checks">
            <li className={e.ruc && /^[0-9]{13}$/.test(e.ruc) ? "ok" : "bad"}>
              {e.ruc && /^[0-9]{13}$/.test(e.ruc) ? "✓" : "⚠"} RUC registrado y válido
            </li>
            <li className={e.razon_social ? "ok" : "bad"}>
              {e.razon_social ? "✓" : "⚠"} Razón social completa
            </li>
            <li className={e.ruta_p12 ? "ok" : "bad"}>
              {e.ruta_p12 ? "✓" : "⚠"} Firma electrónica (.p12) cargada
            </li>
            <li className={e.p12_password ? "ok" : "bad"}>
              {e.p12_password ? "✓" : "⚠"} Contraseña del .p12 guardada
            </li>
            <li className={e.regimen ? "ok" : "bad"}>
              {e.regimen ? "✓" : "⚠"} Régimen tributario definido
            </li>
          </ul>
          {e.ruta_p12 ? (
            <p className="sri-connected" role="status">
              ✓ Su cuenta está conectada con el SRI. Los comprobantes se
              enviarán con firma electrónica válida.
            </p>
          ) : (
            <div className="sri-alert" role="alert">
              <span className="sri-warn">⚠</span>
              <div>
                <h3>Su cuenta no está conectada con el SRI</h3>
                <p>
                  Para poder sincronizar sus documentos electrónicos es
                  necesario que conecte su cuenta al SRI. Cargue su firma
                  electrónica (.p12) en "Logo y certificado" o compre una en
                  entidades autorizadas como{" "}
                  <a
                    href="https://www.seguridaddata.com.ec"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Seguridad Data
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
          <div className="sri-actions">
            <button
              type="button"
              className="sri-connect"
              onClick={() => {
                document
                  .getElementById("p12-upload")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
                (
                  document.getElementById("p12-upload-input") as HTMLInputElement | null
                )?.focus();
              }}
            >
              Conectar
            </button>
          </div>
        </div>
      </section>
      <form className="card editor-grid" onSubmit={save}>
        <h2>Información empresarial</h2>
        <label>
          Nombre del acceso (usuario)
          <input
            value={personalName}
            onChange={(e) => setPersonalName(e.target.value)}
            disabled={!editable}
          />
        </label>
        <label>
          Nombre comercial
          <input
            name="nombre"
            defaultValue={e.nombre}
            required
            disabled={!editable}
          />
        </label>
        <label>
          Razón social
          <input
            name="razon_social"
            defaultValue={e.razon_social}
            required
            disabled={!editable}
          />
        </label>
        <label>
          RUC (13 dígitos)
          <input
            name="ruc"
            defaultValue={e.ruc ?? ""}
            pattern="[0-9]{13}"
            disabled={!editable}
          />
        </label>
        <label>
          Dirección
          <input
            name="direccion"
            defaultValue={e.direccion}
            disabled={!editable}
          />
        </label>
        <label>
          Régimen tributario
          <select
            name="regimen"
            defaultValue={e.regimen ?? "general"}
            disabled={!editable}
          >
            <option value="general">Régimen General</option>
            <option value="rimpe_emprendedor">RIMPE Emprendedor</option>
            <option value="rimpe_negocio_popular">RIMPE Negocio Popular</option>
          </select>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="obligado_contabilidad"
            defaultChecked={e.obligado_contabilidad ?? false}
            disabled={!editable}
          />
          <span>Obligado a llevar contabilidad</span>
        </label>
        <button disabled={busy || !editable}>Guardar información</button>
      </form>
      <section className="card">
        <h2>Logo y certificado</h2>
        <label>
          Logo de empresa (PNG/JPEG)
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy || !editable}
            onChange={(event) => void upload(event.target.files?.[0], "logos")}
          />
        </label>
        <small>{e.logo_path ? "Logo configurado" : "Sin logo cargado"}</small>
        <label id="p12-upload">
          Certificado .p12
          <input
            id="p12-upload-input"
            type="file"
            accept=".p12"
            disabled={busy || !editable}
            onChange={(event) =>
              void upload(event.target.files?.[0], "certificados")
            }
          />
        </label>
        <p>
          {e.ruta_p12
            ? "Certificado privado almacenado"
            : "No has cargado un certificado"}
        </p>
        <label>
          Contraseña del certificado .p12
          <input
            type="password"
            name="p12_password"
            autoComplete="off"
            placeholder="Requerida para firmar en modo real"
            disabled={busy || !editable}
            onBlur={async (event) => {
              const pwd = event.target.value;
              if (!pwd) return;
              try {
                check(
                  await db()
                    .from("empresas")
                    .update({ p12_password: pwd })
                    .eq("id", access!.tenant_id),
                );
                setMessage(
                  "Contraseña del certificado guardada para la firma real.",
                );
                event.target.value = "";
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "No se pudo guardar la contraseña",
                );
              }
            }}
          />
        </label>
        <p className="notice">
          La firma XAdES-BES y el envío al SRI están habilitados vía
          SRI_MODE=real en la Edge Function. El .p12 se almacena en un bucket
          privado y la firma ocurre en el servidor, nunca en el navegador.
        </p>
        {e.ruta_p12 && (
          <p className="alert" role="alert">
            <b>Certificado electrónico importado.</b> En esta fase NO se
            autorizan comprobantes ante el SRI: todas las operaciones de
            ventas/alquiler se registran como <b>ventas internas</b>. Conecta
            tu webhook y SRI_MODE=real antes de facturar oficialmente.
          </p>
        )}
      </section>
    </section>
  );
}
