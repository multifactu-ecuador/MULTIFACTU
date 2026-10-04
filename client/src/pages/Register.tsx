import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, configured, check } from "../lib/supabase";
import { validarIdentificacion } from "../../../shared/identity.ts";
import Brand from "../components/Brand";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legal";

export default function Register() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [pendingEmail, setPendingEmail] = useState(""),
    [resendBusy, setResendBusy] = useState(false),
    [resendMessage, setResendMessage] = useState(""),
    [resendAvailable, setResendAvailable] = useState(true),
    [identification, setIdentification] = useState(""),
    [legalAccepted, setLegalAccepted] = useState(false);
  const navigate = useNavigate();
  const validation = identification
    ? validarIdentificacion(
        identification.length === 10 ? "05" : "04",
        identification,
      )
    : null;

  const confirmationRedirect = () =>
    new URL("/auth/confirm", window.location.origin).toString();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validation?.valid) {
      setError("Revisa la cédula o RUC");
      return;
    }
    if (!legalAccepted) {
      setError("Debes aceptar los Términos y la Política de privacidad.");
      return;
    }
    const values = new FormData(e.currentTarget);
    const email = String(values.get("email")).trim().toLowerCase();
    setBusy(true);
    setError("");
    try {
      const data = check(
        await db().auth.signUp({
          email,
          password: String(values.get("password")),
          options: {
            emailRedirectTo: confirmationRedirect(),
            data: {
              empresa: String(values.get("empresa")),
              nombre: String(values.get("nombre")),
              identificacion: identification,
              consentimiento: true,
              version_terminos: TERMS_VERSION,
              version_privacidad: PRIVACY_VERSION,
            },
          },
        }),
      );
      if (data.session) navigate("/app");
      else {
        setPendingEmail(email);
        setDone(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear tu negocio");
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!pendingEmail || !resendAvailable) return;
    setResendBusy(true);
    setError("");
    setResendMessage("");
    try {
      check(
        await db().auth.resend({
          type: "signup",
          email: pendingEmail,
          options: { emailRedirectTo: confirmationRedirect() },
        }),
      );
      setResendMessage("Enviamos otro enlace. Revisa tu bandeja de entrada y la carpeta de spam.");
      setResendAvailable(false);
      window.setTimeout(() => setResendAvailable(true), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reenviar el correo");
    } finally {
      setResendBusy(false);
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
              <li key={t}>✦ {t}</li>
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
                Enviamos el enlace de confirmación a <b>{pendingEmail}</b>.
                Revisa también la carpeta de spam. Confirma tu correo antes de
                entrar.
              </p>
              {resendMessage && <p role="status">{resendMessage}</p>}
              {error && <p role="alert" className="error">{error}</p>}
              <button
                type="button"
                className="secondary"
                disabled={resendBusy || !resendAvailable}
                onClick={() => void resendConfirmation()}
              >
                {resendBusy
                  ? "Reenviando..."
                  : resendAvailable
                    ? "Reenviar correo de confirmación"
                    : "Espera un minuto para reenviar"}
              </button>
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
                  <input
                    name="consent"
                    type="checkbox"
                    required
                    checked={legalAccepted}
                    onChange={(event) => setLegalAccepted(event.target.checked)}
                  />
                  <span>
                    He leído y acepto los <Link to="/terminos">Términos de
                    servicio</Link> y la <Link to="/privacidad">Política de
                    privacidad</Link> de MULTIFACTU.
                  </span>
                </label>
                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <button disabled={busy || !configured || !validation?.valid || !legalAccepted}>
                  {busy
                    ? "Creando tu empresa..."
                    : "Crear cuenta · 7 días gratis"}
                </button>
              </form>
              <p className="divider">o regístrate con</p>
              <button
                type="button"
                className="google-btn"
                disabled={!configured || !legalAccepted}
                onClick={() =>
                  void db().auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: confirmationRedirect() },
                  })
                }
              >
                Continuar con Google
              </button>
              {!legalAccepted && (
                <small>Debes aceptar los Términos y la Política de privacidad para continuar.</small>
              )}
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
