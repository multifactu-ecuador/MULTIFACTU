import { Link, useLocation } from "react-router-dom";
import { SignIn } from "@clerk/react";
import { configured } from "../lib/supabase";
import Brand from "../components/Brand";

export default function Login() {
  const location = useLocation();
  const from = location.state?.from;
  // Al terminar el inicio de sesión: la ruta original (/app/…) si venía de un
  // guard, o la raíz del área autenticada (/app). Desde ahí ProtectedRoute
  // decide si va a /onboarding o al interior.
  const destino =
    typeof from === "string" && from.startsWith("/app") ? from : "/app";

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
          <span className="ai-tag">✦ IA integrada · RUFO</span>
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
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {/* routing="hash": toda la navegación interna de Clerk ocurre en
                el fragmento de URL, así la ruta /login de React Router nunca
                deja de coincidir. */}
            <SignIn
              routing="hash"
              fallbackRedirectUrl={destino}
              signUpUrl="/registro"
            />
          </div>
          <p>
            ¿Aún no tienes cuenta?{" "}
            <Link to="/registro">Prueba Luxury 7 días</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
