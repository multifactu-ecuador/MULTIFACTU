import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { db, check } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { validarIdentificacion } from "../../../shared/identity.ts";
import Brand from "../components/Brand";
// Alta fiscal obligatoria para cuentas creadas vía OAuth (Google), donde el
// trigger de registro no dispone de los datos de empresa/cédula.
export default function Onboarding() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [identification, setIdentification] = useState("");
  const { access, needsOnboarding, refresh, logout } = useAuth();
  const navigate = useNavigate();
  if (access && !needsOnboarding) navigate("/app", { replace: true });
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
      check(
        await db().rpc("crear_mi_empresa", {
          p_empresa: String(values.get("empresa")),
          p_identificacion: identification,
          p_nombre: String(values.get("nombre")),
          p_consentimiento: values.get("consent") === "on",
        }),
      );
      await refresh();
      navigate("/app");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear tu empresa");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <button type="button" className="linklike" onClick={() => void logout()}>
          Salir
        </button>
      </header>
      <div className="auth-grid">
        <section>
          <p className="eyebrow">CASI LISTO</p>
          <h1>
            Completa
            <br />
            tu negocio.
          </h1>
          <p>
            Para facturar en Ecuador necesitamos tu razón social y tu
            identificación fiscal.
          </p>
        </section>
        <section className="auth-card">
          <h2>Datos del negocio</h2>
          <form onSubmit={submit}>
            <label>
              Nombre completo
              <input name="nombre" autoComplete="name" required minLength={2} maxLength={100} />
            </label>
            <label>
              Nombre de la empresa
              <input name="empresa" autoComplete="organization" required minLength={2} maxLength={160} />
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
            <button disabled={busy || !validation?.valid}>
              {busy ? "Guardando…" : "Comenzar prueba de 7 días"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
