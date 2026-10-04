import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Check,
  Package,
  CalendarDays,
  ReceiptText,
  ChartNoAxesCombined,
  ShieldCheck,
  Users,
  Lock,
  BadgeCheck,
  FileCheck2,
  ServerCog,
} from "lucide-react";
import Brand from "../components/Brand";
export const plans = [
  {
    id: "inicial",
    name: "Inicial",
    price: 6.99,
    description: "Lo esencial para vender y facturar.",
    items: [
      "Facturación electrónica (hasta 50 comprobantes/mes)",
      "Inventario y productos",
      "Servicios y proformas",
      "Gestión de clientes",
      "Nota de crédito de demostración",
      "Compartir comprobantes por WhatsApp/Correo",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 11.99,
    description: "Ventas y alquileres, bajo control.",
    items: [
      "Todo el plan Inicial",
      "Hasta 200 comprobantes/mes",
      "Alquiler de maquinaria y herramientas",
      "Contratos y garantías",
      "Control de fechas y disponibilidad",
      "Flujo de comprobantes para pruebas",
    ],
    popular: true,
  },
  {
    id: "luxury",
    name: "Luxury",
    price: 18.99,
    description: "Una visión completa de tu empresa.",
    items: [
      "Todo el plan Pro",
      "Comprobantes ilimitados",
      "Caja e ingresos y gastos",
      "Cuentas por cobrar y pagar",
      "Análisis de rentabilidad",
      "Base para facturación programada",
      "Base para integración SRI y firma electrónica",
    ],
  },
];
export default function Landing() {
  return (
    <div className="marketing">
      <header className="marketing-header">
        <Brand />
        <nav>
          <a href="#modulos">Soluciones</a>
          <Link to="/facturacion-electronica">Facturación electrónica</Link>
          <Link to="/inteligencia-negocios">Inteligencia</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/alquileres">Alquileres</Link>
          <a href="#planes">Planes</a>
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
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">MULTIFACTU · NEGOCIOS DE ECUADOR</p>
            <h1>
              Evoluciona
              <br />
              Digitalmente
              <br />
              <span>tu Negocio</span>
            </h1>
            <p className="hero-description">
              Soluciones inmediatas para organizar tu negocio: sistema de
              ventas, alquiler de maquinaria, equipos y herramientas, servicios
              y mantenimiento. Controla todo desde un solo lugar.
            </p>
            <div className="hero-actions">
              <Link className="button light" to="/registro">
                Prueba gratis de 7 días <ArrowUpRight size={17} />
              </Link>
              <a href="#modulos">Explorar soluciones</a>
            </div>
            <div className="hero-proof">
              <span>
                <Check size={14} />
                Sin tarjeta
              </span>
              <span>
                <Check size={14} />
                Luxury por 7 días
              </span>
              <span>
                <Check size={14} />
                Cancela cuando quieras
              </span>
            </div>
          </div>
          <div className="product-preview">
            <header>
              <span>▣ MULTIFACTU</span>
              <small>Vista de ejemplo</small>
            </header>
            <div className="preview-layout">
              <aside>
                <b>Punto de alquiler</b>
                <span>Ventas</span>
                <span>Comprobantes</span>
                <span>Inventario</span>
                <span>Finanzas</span>
              </aside>
              <section>
                <span className="eyebrow">NUEVA OPERACIÓN</span>
                <h3>Tu próximo alquiler.</h3>
                <div className="preview-client">
                  <b>Constructora del Litoral</b>
                  <small>Entrega 02 oct · Devolución 07 oct</small>
                </div>
                <div className="preview-row">
                  <span>
                    <b>Generador 10 kVA</b>
                    <small>5 días · Disponible</small>
                  </span>
                  <b>$275,00</b>
                </div>
                <div className="preview-row">
                  <span>
                    <b>Transporte / flete</b>
                    <small>Servicio adicional</small>
                  </span>
                  <b>$50,00</b>
                </div>
                <dl>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>$325,00</dd>
                  </div>
                  <div>
                    <dt>IVA 15%</dt>
                    <dd>$48,75</dd>
                  </div>
                  <div className="preview-total">
                    <dt>Total factura</dt>
                    <dd>$373,75</dd>
                  </div>
                </dl>
                <p className="preview-guarantee">
                  Garantía separada <b>$150,00</b>
                </p>
                <div className="preview-cta">Preparar comprobante →</div>
              </section>
            </div>
            <div className="preview-note">
              <Check size={20} />
              <span>
                Todo conectado.
                <small>Ventas + alquiler + control empresarial</small>
              </span>
            </div>
          </div>
        </section>
        <div className="industry-strip">
          <span>UNA OPERACIÓN MÁS CLARA PARA</span>
          <b>Facturación electrónica</b>
          <b>Maquinaria, equipos y herramientas</b>
          <b>Servicios y mantenimiento</b>
        </div>
        <section className="marketing-section" id="modulos">
          <p className="eyebrow">LO QUE TENEMOS PARA TI</p>
          <h2>
            Controla todo
            <br />
            desde un solo lugar.
          </h2>
          <div className="module-grid">
            {[
              {
                icon: ReceiptText,
                title: "Ventas y facturación",
                text: "Organiza tus operaciones, impuestos y comprobantes.",
              },
              {
                icon: Package,
                title: "Inventario y productos",
                text: "Edita catálogo, precios y existencias de tu empresa.",
              },
              {
                icon: CalendarDays,
                title: "Alquileres con control",
                text: "Fechas, contratos, disponibilidad y garantías separadas.",
              },
              {
                icon: ChartNoAxesCombined,
                title: "Finanzas claras",
                text: "Caja, cobros, gastos y cuentas en un mismo espacio.",
              },
              {
                icon: Users,
                title: "Clientes conectados",
                text: "Datos fiscales e historial ordenados por negocio.",
              },
              {
                icon: ShieldCheck,
                title: "Tu propio espacio",
                text: "Datos aislados, permisos por plan y control desde PostgreSQL.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <span>0{i + 1}</span>
                <Icon size={25} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="marketing-section plans-section" id="planes">
          <p className="eyebrow">CRECE A TU RITMO</p>
          <h2>Un plan para tu próximo paso.</h2>
          <p>
            Empieza con Luxury gratis por 7 días. Después eliges tu plan, sin
            cobros automáticos.
          </p>
          <div className="plans-grid">
            {plans.map((p) => (
              <article key={p.id}>
                <div>
                  <h3>{p.name}</h3>
                  {p.id === "pro" && (
                    <span className="pill">VENTAS + ALQUILER</span>
                  )}
                </div>
                <p>{p.description}</p>
                <div className="plan-price">
                  ${p.price}
                  <small> + IVA / mes</small>
                </div>
                <ul>
                  {p.items.map((i) => (
                    <li key={i}>
                      <Check size={15} />
                      {i}
                    </li>
                  ))}
                </ul>
                <Link to="/registro" className="button">
                  Probar {p.name} →
                </Link>
              </article>
            ))}
          </div>
          <p className="scope-note">
            La integración SRI de esta entrega es una simulación claramente
            identificada. Firma real, autorización tributaria y cobros
            comerciales requieren completar y validar la integración antes de
            ofrecerlos.
          </p>
        </section>
        <section className="trial-section">
          <div>
            <p className="eyebrow">TU NEGOCIO. TU SIGUIENTE PASO.</p>
            <h2>
              Empieza hoy.
              <br />7 días gratis.
            </h2>
            <p>
              Nombre, cédula o RUC, correo y contraseña. Todas las funciones de
              Luxury durante tu prueba.
            </p>
          </div>
          <Link to="/registro" className="button light">
            Crear mi cuenta <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <section className="trust-section">
        <p className="eyebrow">CONFIANZA Y CUMPLIMIENTO</p>
        <h2>Una base para tu facturación electrónica</h2>
        <div className="trust-grid">
          <article>
            <FileCheck2 size={26} />
            <h3>Claves de acceso en demostración</h3>
            <p>
              Flujos de facturas y notas de crédito con claves de 49 dígitos y
              secuenciales por establecimiento y punto de emisión.
            </p>
          </article>
          <article>
            <BadgeCheck size={26} />
            <h3>Estructura tributaria inicial</h3>
            <p>
              IVA desglosado 0%, 5% y 15% y XML de demostración como base de
              una futura integración tributaria.
            </p>
          </article>
          <article>
            <Lock size={26} />
            <h3>Tus datos aislados</h3>
            <p>
              Cada empresa solo accede a su información: aislamiento por
              tenant con Row Level Security en toda la base de datos.
            </p>
          </article>
          <article>
            <ServerCog size={26} />
            <h3>Infraestructura con controles</h3>
            <p>
              Configuración con PostgreSQL, cifrado en tránsito (TLS) y
              certificados en almacenamiento privado.
            </p>
          </article>
        </div>
        <p className="scope-note">
          En esta fase la firma XAdES y el envío al SRI están simulados. Antes
          de operar en producción se debe completar la integración, validar la
          ficha técnica vigente y configurar un certificado .p12 válido.
        </p>
      </section>
      <footer>
        <Brand />
        <p>Ventas, alquileres, servicios y mantenimiento para Ecuador.</p>
        <div>
          <Link to="/facturacion-electronica">Facturación electrónica</Link>
          <Link to="/inteligencia-negocios">Inteligencia de negocios</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/terminos">Términos de servicio</Link>
          <Link to="/privacidad">Política de privacidad</Link>
          <Link to="/contrato-encargo">Contrato de encargo</Link>
          <a href="tel:0987516088">0987516088</a>
        </div>
        <small>
          © 2026 MULTIFACTU · Sin respaldo oficial del SRI declarado
        </small>
      </footer>
    </div>
  );
}
