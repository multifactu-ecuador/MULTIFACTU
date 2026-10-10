import { Link } from "react-router-dom";
import Brand from "../components/Brand";

// Destino del successUrl de Paddle Checkout: el pago se procesó y el
// cliente aterriza aquí. El alta real del plan llega con la sincronización
// de suscripciones (webhook de Paddle); esta página no activa nada por sí sola.
export default function Welcome() {
  return (
    <div className="marketing">
      <header className="marketing-header">
        <Brand />
        <div>
          <Link className="text-link" to="/login">
            Iniciar sesión
          </Link>
        </div>
      </header>
      <main>
        <section className="marketing-section">
          <p className="eyebrow">PAGO RECIBIDO</p>
          <h2>¡Gracias por confiar en MULTIFACTU!</h2>
          <p>
            Tu pago se procesó correctamente con Paddle. En cuanto confirmemos
            la suscripción, tu plan queda activo en la cuenta asociada a este
            correo.
          </p>
          <p className="scope-note">
            ¿Aún no tienes cuenta? Créeala con el mismo correo que usaste en
            el pago para que tu plan quede asociado.
          </p>
          <div className="hero-actions">
            <Link className="button green" to="/app">
              Ir al sistema
            </Link>
            <Link className="button light" to="/registro">
              Crear cuenta gratis ↗
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
