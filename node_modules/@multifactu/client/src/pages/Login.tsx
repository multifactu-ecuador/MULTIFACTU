import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { db, configured, check } from "../lib/supabase";
import Brand from "../components/Brand";
export default function Login() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      check(
        await db().auth.signInWithPassword({
          email: String(form.get("email")).trim(),
          password: String(form.get("password")),
        }),
      );
      const target = location.state?.from;
      navigate(
        typeof target === "string" && target.startsWith("/app")
          ? target
          : "/app",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <Link to="/registro">Crear cuenta</Link>
      </header>
      <div className="auth-grid">
        <section>
          <p className="eyebrow">BIENVENIDO A MULTIFACTU</p>
          <h1>
            Tu negocio.
            <br />
            Un solo lugar.
          </h1>
          <p>
            Ventas, alquileres, servicios y finanzas. Vuelve a tu espacio de
            trabajo.
          </p>
        </section>
        <section className="auth-card">
          <h2>Inicia sesión</h2>
          <p>Accede con tu correo y contraseña.</p>
          {!configured && (
            <div className="notice">
              Configura Supabase en client/.env para habilitar el acceso real.
              El diseño puede verse sin credenciales.
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Correo electrónico
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={12}
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy || !configured}>
              {busy ? "Ingresando…" : "Iniciar sesión"}
            </button>
          </form>
          <p className="divider">o continúa con</p>
          <button
            type="button"
            className="google-btn"
            disabled={!configured}
            onClick={() =>
              void db().auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin + "/app" },
              })
            }
          >
            Continuar con Google
          </button>
          <p>
            ¿Aún no tienes cuenta?{" "}
            <Link to="/registro">Prueba Luxury 7 días</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
