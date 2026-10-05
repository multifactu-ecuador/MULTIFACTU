import { Link } from "react-router-dom";
import { SignUp } from "@clerk/react";
import { configured } from "../lib/supabase";
import Brand from "../components/Brand";

/**
 * El alta en sí la hace Clerk (correo + contraseña, con su verificación).
 * Los datos de negocio (empresa, cédula) y los consentimientos legales con
 * sus versiones NO se recolectan aquí: se recogen y guardan en /onboarding
 * mediante la RPC crear_mi_empresa, que ProtectedRoute exige a todo usuario
 * sin perfil/empresa.
 */
export default function Register() {
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
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {/* routing="hash" mantiene la navegación de Clerk dentro del
                fragmento de URL y evita choques con React Router en
                /registro. El usuario cae en /onboarding, donde se completan
                empresa, cédula y consentimientos. */}
            <SignUp
              routing="hash"
              fallbackRedirectUrl="/onboarding"
              signInUrl="/login"
            />
          </div>
          <small>
            Al crear tu cuenta aceptas los{" "}
            <Link to="/terminos">Términos de servicio</Link> y la{" "}
            <Link to="/privacidad">Política de privacidad</Link>. La
            confirmación de los consentimientos se completa en el siguiente
            paso.
          </small>
          <p>
            ¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
