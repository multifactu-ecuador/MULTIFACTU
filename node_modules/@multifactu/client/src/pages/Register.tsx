import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, configured, check } from "../lib/supabase";
import { validarIdentificacion } from "../../../shared/identity.ts";
import Brand from "../components/Brand";
export default function Register() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [identification, setIdentification] = useState("");
  const navigate = useNavigate();
  const validation = identification
    ? validarIdentificacion(
        identification.length === 10 ? "05" : "04",
        identification,
      )
    : null;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validation?.valid) {
      setError("Revisa la cédula o RUC");
      return;
    }
    const values = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const data = check(
        await db().auth.signUp({
          email: String(values.get("email")).trim(),
          password: String(values.get("password")),
          options: {
            emailRedirectTo: location.origin + "/app",
            data: {
              empresa: String(values.get("empresa")),
              nombre: String(values.get("nombre")),
              identificacion: identification,
              consentimiento: values.get("consent") === "on",
            },
          },
        }),
      );
      if (data.session) navigate("/app");
      else setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear tu negocio");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <Link to="/login">Ya tengo una cuenta</Link>
      </header>
      <div className="auth-grid">
        <section>
          <p className="eyebrow">TU SIGUIENTE PASO</p>
          <h1>
            Evoluciona
            <br />
            digitalmente.
          </h1>
          <p>
            Crea tu negocio con todas las funciones de Luxury durante siete
            días.
          </p>
          <ul className="benefits">
            {[
              "Ventas, inventario, clientes y servicios",
              "Alquiler de maquinaria, equipos y herramientas",
              "Caja, cuentas y análisis financiero",
              "Sin tarjeta ni cobro automático",
            ].map((t) => (
              <li key={t}>✓ {t}</li>
            ))}
          </ul>
          <small>
            La prueba comienza al registrarte. Al vencer se bloquean las
            funciones hasta contratar un plan. Tus datos se conservan.
          </small>
        </section>
        <section className="auth-card">
          <span className="pill">7 DÍAS · PLAN LUXURY</span>
          <h2>Crea tu cuenta</h2>
          {done ? (
            <div className="notice" role="status">
              <h3>Revisa tu correo</h3>
              <p>
                Si el registro se completó, Supabase enviará la confirmación
                configurada. Confirma tu correo antes de entrar. Si ya tienes
                cuenta, inicia sesión. La prueba empieza al crear el usuario,
                incluso si falta confirmar el correo.
              </p>
              <Link to="/login">Ir a iniciar sesión</Link>
            </div>
          ) : (
            <>
              {!configured && (
                <p className="notice">
                  Configura Supabase para registrar cuentas reales. El
                  formulario no crea usuarios ficticios.
                </p>
              )}
              <form onSubmit={submit}>
                <label>
                  Nombre completo
                  <input
                    name="nombre"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  Nombre de la empresa
                  <input
                    name="empresa"
                    autoComplete="organization"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </label>
                <label>
                  Cédula o RUC
                  <input
                    value={identification}
                    onChange={(e) =>
                      setIdentification(e.target.value.replace(/\D/g, ""))
                    }
                    name="identificacion"
                    inputMode="numeric"
                    required
                    minLength={10}
                    maxLength={13}
                  />
                </label>
                {validation && !validation.valid && (
                  <small className="error">Revisa la identificación.</small>
                )}
                {validation?.warning && <small>{validation.warning}</small>}
                <label>
                  Correo electrónico
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={128}
                  />
                </label>
                <label className="checkbox">
                  <input name="consent" type="checkbox" required />
                  <span>
                    Acepto los{" "}
                    <Link to="/terminos">
                      términos y política de privacidad de MULTIFACTU
                    </Link>
                    .
                  </span>
                </label>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button disabled={busy || !configured || !validation?.valid}>
                  {busy
                    ? "Creando tu empresa…"
                    : "Crear cuenta · 7 días gratis"}
                </button>
              </form>
              <p className="divider">o regístrate con</p>
              <button
                type="button"
                className="google-btn"
                disabled={!configured}
                onClick={() =>
                  void db().auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: location.origin + "/app" },
                  })
                }
              >
                Continuar con Google
              </button>
            </>
          )}
          <p>
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
