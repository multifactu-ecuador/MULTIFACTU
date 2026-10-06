import { Link } from "react-router-dom";
import Brand from "./Brand";

/**
 * Pie corporativo compartido por todas las páginas públicas.
 * Incluye la página de estado de Better Stack y la mención a la IA
 * integrada (RUFO) en la descripción.
 */
export default function MarketingFooter({ note }: { note?: string }) {
  return (
    <footer>
      <Brand />
      <p>
        Sistema de facturación, alquileres y gestión con IA para negocios de
        Ecuador.
      </p>
      <div>
        <Link to="/facturacion-electronica">Facturación electrónica</Link>
        <Link to="/inteligencia-negocios">Inteligencia de negocios</Link>
        <Link to="/seguridad">Seguridad</Link>
        <Link to="/alquileres">Alquileres</Link>
        <a
          className="status-link"
          href="https://multifactu.betteruptime.com/"
          target="_blank"
          rel="noreferrer"
        >
          Estado del servicio
        </a>
        <Link to="/terminos">Términos de servicio</Link>
        <Link to="/privacidad">Política de privacidad</Link>
        <Link to="/contrato-encargo">Contrato de encargo</Link>
        <Link to="/cookies">Política de cookies</Link>
        <Link to="/cumplimiento-legal">Cumplimiento legal</Link>
        <Link to="/reembolsos">Política de reembolsos</Link>
      </div>
      <small>
        {note ??
          "© 2026 MULTIFACTU · Emisión real sujeta a configuración y validación fiscal."}
      </small>
    </footer>
  );
}
