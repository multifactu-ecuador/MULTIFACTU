import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, FileBarChart, ShoppingCart, Sparkles, UsersRound } from "lucide-react";
import Brand from "../components/Brand";

const reportCards = [
  {
    icon: FileBarChart,
    title: "Reporte de ventas",
    text: "Revisa estadísticas de tus ventas por ítem y conoce qué productos o servicios generan más movimiento.",
    bullets: ["Ventas por producto o servicio", "Resumen de cobros", "Cartera pendiente de clientes"],
  },
  {
    icon: UsersRound,
    title: "Cuentas por cobrar",
    text: "Identifica clientes con saldos pendientes y revisa las fechas de vencimiento para dar seguimiento a tu cartera.",
    bullets: ["Saldos por cliente", "Vencimientos próximos", "Historial de pagos registrados"],
  },
  {
    icon: ShoppingCart,
    title: "Reporte de compras",
    text: "Mantente al día con proveedores, pagos pendientes y avisos de fechas de vencimiento de tus facturas.",
    bullets: ["Saldos por proveedor", "Pagos pendientes", "Control de vencimientos"],
  },
];

export default function BusinessIntelligence() {
  return <div className="marketing info-marketing">
    <header className="marketing-header">
      <Brand />
      <nav>
        <Link to="/facturacion-electronica">Facturación electrónica</Link>
        <Link to="/inteligencia-negocios">Inteligencia</Link>
        <Link to="/seguridad">Seguridad</Link>
        <Link to="/alquileres">Alquileres</Link>
        <Link to="/#planes">Planes</Link>
      </nav>
      <div><Link className="text-link" to="/login">Iniciar sesión</Link><Link className="button light" to="/registro">Crear cuenta gratis ↗</Link></div>
    </header>
    <main className="info-main">
      <section className="insights-hero">
        <div>
          <p className="eyebrow">PANEL DE INTELIGENCIA DE NEGOCIOS</p>
          <h1>Decisiones más claras para tu negocio.</h1>
          <p>Obtén una visión general del rendimiento de tu empresa con métricas clave de ventas, cobros, pagos y cartera.</p>
          <div className="info-actions"><Link className="button light" to="/registro">Conocer MULTIFACTU <ArrowRight size={17} /></Link><Link to="/app/finanzas">Ver módulo de finanzas</Link></div>
        </div>
        <aside className="insight-dashboard" aria-label="Vista ilustrativa del panel de inteligencia">
          <div className="insight-dashboard-head"><span>Resumen de rendimiento</span><small>Vista ilustrativa</small></div>
          <div className="insight-metrics">
            <div><small>Ventas del período</small><b>$12.480</b><span>↗ 12,4%</span></div>
            <div><small>Por cobrar</small><b>$1.240</b><span className="attention">8 facturas</span></div>
            <div><small>Por pagar</small><b>$975</b><span>3 próximos pagos</span></div>
          </div>
          <div className="insight-chart">
            <div><b>Ventas por semana</b><small>Últimas 6 semanas</small></div>
            <svg viewBox="0 0 460 156" role="img" aria-label="Gráfico ilustrativo de crecimiento de ventas">
              <defs><linearGradient id="salesFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#a8a8b0" stopOpacity=".36"/><stop offset="100%" stopColor="#a8a8b0" stopOpacity="0"/></linearGradient></defs>
              <path d="M10 128 L86 110 L162 118 L238 78 L314 92 L390 38 L450 55 L450 146 L10 146 Z" fill="url(#salesFill)"/>
              <polyline points="10,128 86,110 162,118 238,78 314,92 390,38 450,55" fill="none" stroke="#f2f2f4" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="390" cy="38" r="6" fill="#f2f2f4"/>
              <line x1="0" y1="146" x2="460" y2="146" stroke="#3b3b42"/>
            </svg>
          </div>
          <div className="insight-products"><span>Productos con más movimiento</span><div><i style={{ width: "82%" }} /><b>Servicio técnico</b></div><div><i style={{ width: "58%" }} /><b>Alquiler de equipo</b></div><div><i style={{ width: "36%" }} /><b>Repuestos</b></div></div>
        </aside>
      </section>
      <section className="info-section">
        <div className="info-section-heading"><p className="eyebrow">INFORMACIÓN PARA DECIDIR</p><h2>Todo lo importante, en una sola vista.</h2></div>
        <div className="report-grid">{reportCards.map(({ icon: Icon, title, text, bullets }) => <article key={title}><Icon size={26} /><h3>{title}</h3><p>{text}</p><ul>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul></article>)}</div>
      </section>
      <section className="info-banner insight-note"><BarChart3 size={28} /><div><h2>Datos de tu empresa, no estimaciones.</h2><p>El panel toma como base las ventas, cobros, gastos y cuentas que registres. La vista gráfica de esta página es solo un ejemplo de cómo podrás revisar tus indicadores.</p></div></section>
      <section className="info-banner insight-note"><Sparkles size={28} /><div><h2>Asistente IA de reportes comerciales.</h2><p>Un chat interno donde el dueño pregunta en español simple: «¿cuánto vendí este mes comparado al mes pasado?», «¿cuáles son mis 3 clientes que más me deben?», «¿qué producto se está vendiendo menos?». El sistema analiza las facturas, cobros e inventario de tu empresa y responde con un resumen instantáneo. Disponible en el plan Luxury.</p></div></section>
      <section className="info-section info-faq">
        <p className="eyebrow">PARA QUÉ SIRVE</p>
        <div>
          <article><h3>Conoce qué vendes más</h3><p>Compara productos, servicios y períodos para priorizar lo que mueve tu negocio.</p></article>
          <article><h3>Cuida tu flujo de caja</h3><p>Revisa lo que falta por cobrar y las obligaciones que se acercan antes de que venzan.</p></article>
          <article><h3>Actúa a tiempo</h3><p>Usa los vencimientos y saldos pendientes para organizar tus próximos cobros y pagos.</p></article>
        </div>
      </section>
    </main>
    <footer><Brand /><p>Sistema de facturación para ventas, alquileres y servicios en Ecuador.</p><div><Link to="/facturacion-electronica">Facturación electrónica</Link><Link to="/seguridad">Seguridad</Link><Link to="/terminos">Términos de servicio</Link><Link to="/privacidad">Política de privacidad</Link><Link to="/contrato-encargo">Contrato de encargo</Link><Link to="/cookies">Política de cookies</Link><Link to="/cumplimiento-legal">Cumplimiento legal</Link><Link to="/reembolsos">Política de reembolsos</Link></div><small>© 2026 MULTIFACTU · Indicadores basados en los datos registrados por tu empresa.</small></footer>
  </div>;
}
