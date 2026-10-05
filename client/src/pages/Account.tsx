import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Camera, Eye, EyeOff } from "lucide-react";
import { db, check } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";

export default function Account() {
  const { access, session, refresh } = useAuth();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [nombre, setNombre] = useState(access?.nombre ?? ""),
    [telefono, setTelefono] = useState(access?.telefono ?? ""),
    [avatarUrl, setAvatarUrl] = useState<string | null>(null),
    [actual, setActual] = useState(""),
    [nueva, setNueva] = useState(""),
    [verActual, setVerActual] = useState(false),
    [verNueva, setVerNueva] = useState(false);

  const email = session?.user.email ?? "";

  useEffect(() => {
    let live = true;
    const path = access?.avatar_path;
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    void db()
      .storage.from("avatares")
      .createSignedUrl(path, 3600)
      .then((r) => {
        if (live && !r.error) setAvatarUrl(r.data.signedUrl);
      });
    return () => {
      live = false;
    };
  }, [access?.avatar_path]);

  async function guardarFoto(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("La foto debe ser PNG, JPEG o WEBP.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sess = (await db().auth.getSession()).data.session;
      if (!sess) throw Error("Sesión expirada.");
      const path = `${access!.tenant_id}/${sess.user.id}.${
        file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"
      }`;
      const anterior = access?.avatar_path ?? null;
      check(
        await db().storage.from("avatares").upload(path, file, {
          upsert: true,
          contentType: file.type,
        }),
      );
      try {
        check(
          await (db() as any)
            .from("usuarios_perfiles")
            .update({ avatar_path: path })
            .eq("id", sess.user.id),
        );
      } catch (e) {
        if (anterior !== path) await db().storage.from("avatares").remove([path]);
        throw e;
      }
      if (anterior && anterior !== path)
        await db().storage.from("avatares").remove([anterior]).catch(() => {});
      await refresh();
      setMessage("Foto de perfil actualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setBusy(false);
    }
  }

  async function guardarDatos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (telefono && !/^[0-9+\s-]{7,15}$/.test(telefono)) {
      setError("El celular debe tener entre 7 y 15 dígitos.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sess = (await db().auth.getSession()).data.session;
      if (!sess) throw Error("Sesión expirada.");
      check(
        await (db() as any)
          .from("usuarios_perfiles")
          .update({ nombre: nombre.trim(), telefono: telefono.trim() || null })
          .eq("id", sess.user.id),
      );
      await refresh();
      setMessage("Datos personales actualizados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function cambiarPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nueva.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!email) throw Error("No se pudo verificar el correo de la cuenta.");
      const reauth = await db().auth.signInWithPassword({
        email,
        password: actual,
      });
      if (reauth.error) throw Error("La contraseña actual no es correcta.");
      check(await db().auth.updateUser({ password: nueva }));
      setActual("");
      setNueva("");
      setMessage("Contraseña actualizada correctamente.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURACIÓN / DATOS PERSONALES</p>
          <h1>Mi cuenta.</h1>
          <p>Foto, nombre, celular y contraseña de tu acceso.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      <section className="card">
        <h2>Foto de perfil</h2>
        <div className="account-photo">
          <span className="avatar-box">
            {avatarUrl ? <img src={avatarUrl} alt="Foto de perfil" /> : (access?.nombre?.[0] ?? "U")}
          </span>
          <div>
            <small>
              Imagen cuadrada, mínimo 200×200 px. Se usará en tu perfil y
              facturas.
            </small>
            <p>
              <label className="button light" style={{ display: "inline-flex", gap: 8 }}>
                <Camera size={15} />
                Elegir foto
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  onChange={(event) => void guardarFoto(event.target.files?.[0])}
                  hidden
                />
              </label>
            </p>
          </div>
        </div>
      </section>

      <form className="card editor-grid" onSubmit={guardarDatos}>
        <h2>Datos personales</h2>
        <label>
          Nombres completos
          <input
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label>
          Correo electrónico
          <input value={email} readOnly disabled />
        </label>
        <label>
          Celular <Pencil size={12} />
          <input
            value={telefono}
            onChange={(event) => setTelefono(event.target.value)}
            inputMode="tel"
            placeholder="0999999999"
            disabled={busy}
          />
        </label>
        <button disabled={busy}>Guardar datos</button>
      </form>

      <form className="card editor-grid" onSubmit={cambiarPassword}>
        <h2>Cambiar contraseña</h2>
        <label>
          Contraseña actual
          <span className="password-field">
            <input
              type={verActual ? "text" : "password"}
              value={actual}
              onChange={(event) => setActual(event.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setVerActual((v) => !v)}
              aria-label="Mostrar contraseña"
            >
              {verActual ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>
        <label>
          Nueva contraseña
          <span className="password-field">
            <input
              type={verNueva ? "text" : "password"}
              value={nueva}
              onChange={(event) => setNueva(event.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              disabled={busy}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setVerNueva((v) => !v)}
              aria-label="Mostrar contraseña"
            >
              {verNueva ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>
        <button disabled={busy || !actual || !nueva}>
          {busy ? "Guardando…" : "Guardar contraseña"}
        </button>
        <small style={{ gridColumn: "1 / -1" }}>
          Mínimo 6 caracteres. Se verifica tu contraseña actual antes de
          cambiarla.
        </small>
      </form>
    </section>
  );
}
