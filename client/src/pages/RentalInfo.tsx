import { Link } from "react-router-dom";
import Brand from "../components/Brand";
export default function RentalInfo() {
  return (
    <div className="marketing legal">
      <header>
        <Brand />
        <Link className="button light" to="/registro">
          Prueba 7 días
        </Link>
      </header>
      <main>
        <p className="eyebrow">PRO Y LUXURY</p>
        <h1>Alquileres: renta equipos con control total.</h1>
        <p>
          Maquinaria, andamios, herramientas y equipos de construcción. Fechas,
          garantías y disponibilidad por intervalo desde el mismo catálogo.
        </p>
        <div className="module-grid">
          {[
            [
              "Fechas claras",
              "Días iniciados de 24 horas, con fechas en Ecuador.",
            ],
            [
              "Garantía separada",
              "Se registra en el contrato y no se suma al IVA ni al total fiscal.",
            ],
            [
              "Disponibilidad verificada",
              "PostgreSQL bloquea reservas que se superponen, incluso con solicitudes concurrentes.",
            ],
            [
              "Cobros ordenados",
              "Luxury permite cuotas y abonos explícitos desde el módulo financiero.",
            ],
          ].map(([title, text]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <p className="scope-note">
          Esta base registra contratos y fechas. Contrato PDF, foto firmada,
          recordatorios WhatsApp, devolución/cierre, recibo interno e
          implementación real del SRI requieren completar sus flujos antes de
          anunciarse como disponibles.
        </p>
        <Link className="button light" to="/registro">
          Crear cuenta con Luxury por 7 días
        </Link>
      </main>
    </div>
  );
}
