import { Link } from "react-router-dom";
import Brand from "./Brand";

/**
 * Cabecera corporativa compartida por todas las páginas públicas
 * (páginas de información y documentos legales). La landing conserva
 * su propia cabecera porque usa los modales de Clerk.
 */
export default function MarketingHeader() {
  return (
    <header className="marketing-header">
      <Brand />
      <nav>
        <Link to="/facturacion-electronica">Facturación electrónica</Link>
        <Link to="/inteligencia-negocios">Inteligencia</Link>
        <Link to="/seguridad">Seguridad</Link>
        <Link to="/alquileres">Alquileres</Link>
        <Link to="/#planes">Planes</Link>
      </nav>
      <div>
        <Link className="text-link" to="/login">
          Iniciar sesión
        </Link>
        <Link className="button light" to="/registro">
          Crear cuenta gratis ↗
        </Link>
      </div>
    </header>
  );
}
