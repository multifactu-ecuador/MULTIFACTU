import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SignUp } from "@clerk/react";
import { configured } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { PRIVACY_VERSION, TERMS_VERSION } from "../lib/legal";
import Brand from "../components/Brand";

/**
 * El alta en sí la hace Clerk (correo + contraseña o Google, con su
 * verificación). Antes de mostrar el formulario se exige una aceptación
 * explícita y registrada (clickwrap) de TODA la documentación legal:
 * sin marcar la casilla y pulsar el botón de aceptación no se renderiza
 * <SignUp>, así que no se puede crear cuenta por ninguna vía.
 *
 * La aceptación se guarda en el unsafeMetadata del usuario de Clerk
 * (banderas, versiones y fecha) y, en /onboarding, la RPC
 * crear_mi_empresa la registra además en public.consentimientos_legales
 * con esas mismas versiones: doble prueba de la aceptación.
 *
 * Los datos de negocio (empresa, cédula) y los consentimientos con sus
 * versiones NO se recolectan aquí: se recogen en /onboarding.
 */
export default function Register() {
  const { session, loading } = useAuth();
  // Un flujo de Clerk ya en curso vuelve a esta ruta con hash (retorno de
  // Google/OAuth o de verificación de correo): en ese caso hay que montar
  // <SignUp> sin barrera para que procese el callback.
  const flujoEnCurso =
    typeof window !== "undefined" && window.location.hash.length > 1;
  const [marcado, setMarcado] = useState(flujoEnCurso);
  const [aceptado, setAceptado] = useState(flujoEnCurso);
  const [aceptadoEn, setAceptadoEn] = useState("");

  // Quien ya tiene sesión no vuelve a pasar la barrera: su aceptación
  // quedó registrada en el alta anterior (o en el paso de onboarding).
  useEffect(() => {
    if (!loading && session) {
      setMarcado(true);
      setAceptado(true);
    }
  }, [loading, session]);

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
          {!configured && (
            <p className="notice">
              Configura Supabase para registrar cuentas reales.
            </p>
          )}
          {!aceptado ? (
            <>
              <p className="notice">
                Para crear tu cuenta en MULTIFACTU debes aceptar nuestra
                documentación legal: los{" "}
                <Link to="/terminos" target="_blank" rel="noopener noreferrer">
                  Términos y Condiciones (v{TERMS_VERSION})
                </Link>{" "}
                y la{" "}
                <Link to="/privacidad" target="_blank" rel="noopener noreferrer">
                  Política de Privacidad (v{PRIVACY_VERSION})
                </Link>
                . Ábrelos en pestaña nueva: no perderás tu avance.
              </p>
              <label className="checkbox" style={{ marginTop: 16 }}>
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={(event) => setMarcado(event.target.checked)}
                />
                <span>
                  He leído y acepto los Términos y Condiciones y la Política
                  de Privacidad de MULTIFACTU.
                </span>
              </label>
              <button
                type="button"
                className="button"
                style={{ width: "100%", marginTop: 16 }}
                disabled={!marcado}
                onClick={() => {
                  setAceptadoEn(new Date().toISOString());
                  setAceptado(true);
                }}
              >
                Acepto los términos y continúo
              </button>
            </>
          ) : (
            <>
              <p className="notice">
                Aceptación registrada · Términos v{TERMS_VERSION} · Privacidad
                v{PRIVACY_VERSION}
                {aceptadoEn ? ` · ${aceptadoEn}` : ""}.
              </p>
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {/* routing="hash" mantiene la navegación de Clerk dentro del
                    fragmento de URL y evita choques con React Router en
                    /registro. El usuario cae en /onboarding, donde se
                    completan empresa, cédula y consentimientos. */}
                <SignUp
                  routing="hash"
                  fallbackRedirectUrl="/onboarding"
                  signInUrl="/login"
                  unsafeMetadata={{
                    acepta_terminos_servicio: true,
                    acepta_politica_privacidad: true,
                    version_terminos: TERMS_VERSION,
                    version_privacidad: PRIVACY_VERSION,
                    aceptado_en: aceptadoEn || null,
                  }}
                />
              </div>
            </>
          )}
          <small>
            Tu aceptación queda guardada con la fecha y la versión de cada
            documento. La confirmación de los consentimientos legales de tu
            empresa se completa en el siguiente paso.
          </small>
          <p>
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
