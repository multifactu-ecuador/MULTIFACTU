import { Link } from "react-router-dom";
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";
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
  RotateCcw,
  Brain,
  Target,
} from "lucide-react";
import Brand from "../components/Brand";
import WebChat from "../components/WebChat";
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
      "Nota de crédito",
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
      "Flujo completo de comprobantes",
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
      "Facturación programada con IA",
      "Asistente IA de reportes comerciales",
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
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-link" type="button">
                Iniciar sesión
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="button light" type="button">
                Crear cuenta gratis ↗
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">MULTIFACTU · NEGOCIOS DE ECUADOR · POTENCIADO CON IA</p>
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
          <b>Inteligencia artificial aplicada</b>
        </div>
        <section className="tech-section tech-top">
          <p className="eyebrow">TECNOLOGÍA QUE NOS RESPALDA</p>
          <h2>Construido sobre gigantes.</h2>
          <div className="tech-grid">
            <article className="tech-card">
              <img
                className="tech-logo-img"
                src="/brands/nvidia.svg"
                alt="NVIDIA"
                height="30"
              />
              <h3>Inteligencia artificial NVIDIA</h3>
              <p>
                RUFO responde al instante en español con modelos Llama
                servidos en NVIDIA NIM. Tus datos nunca se usan para entrenar
                modelos.
              </p>
            </article>
            <article className="tech-card">
              <img
                className="tech-logo-img"
                src="/brands/supabase.svg"
                alt="Supabase"
                height="30"
              />
              <h3>Base de datos Supabase protegida</h3>
              <p>
                PostgreSQL con Row Level Security: cada empresa solo ve lo
                suyo. Vault cifra la contraseña de tu firma electrónica.
              </p>
            </article>
            <article className="tech-card">
              <img
                className="tech-logo-img"
                src="/brands/clerk-wordmark-blanco.png"
                alt="Clerk"
                height="30"
              />
              <h3>Autenticación con Clerk</h3>
              <p>
                Clerk gestiona tu acceso: verificación de correo,
                recuperación controlada y bloqueo de intentos sospechosos.
              </p>
            </article>
            <article className="tech-card">
              <img
                className="tech-logo-img"
                src="/brands/betterstack.svg"
                alt="Better Stack"
                height="30"
              />
              <h3>Disponibilidad con Better Stack</h3>
              <p>
                Web, API y emisión SRI se comprueban cada 3 minutos. Si algo
                cae, hay alerta en minutos y el estado es público.
              </p>
              <a
                className="status-link"
                href="https://multifactu.betteruptime.com/"
                target="_blank"
                rel="noreferrer"
              >
                Ver estado del servicio <ArrowUpRight size={14} />
              </a>
            </article>
          </div>
        </section>
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
                icon: FileCheck2,
                title: "Proformas en 1 clic",
                text: "Tu cliente aprueba la cotización desde su teléfono y la factura se emite sola.",
              },
              {
                icon: ChartNoAxesCombined,
                title: "Finanzas claras",
                text: "Caja, cobros, gastos y cuentas en un mismo espacio.",
              },
              {
                icon: RotateCcw,
                title: "Notas de crédito",
                text: "Anula comprobantes emitidos con su nota de crédito en un paso.",
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

        <section className="marketing-section rufo-section" id="rufo">
          <img className="rufo-logo" src="/brands/rufo-ia-blanco.png" alt="RUFO IA" />
          <p className="eyebrow">TU ASISTENTE IA</p>
          <h2>
            RUFO aprende
            <br />
            de tu negocio.
          </h2>
          <p className="rufo-intro">
            Responde al instante con tus cifras y cada semana te propone qué
            revisar. Tú decides.
          </p>
          <div className="module-grid">
            {[
              {
                icon: Brain,
                title: "Te responde al instante",
                text: "Pregunta en español: ventas, deudores, caja e inventario reales.",
              },
              {
                icon: Target,
                title: "Aprende cada semana",
                text: "Analiza tus números y te propone riesgos y oportunidades.",
              },
              {
                icon: Lock,
                title: "Tú decides",
                text: "Confirmas o descartas cada hallazgo. Nunca factura ni cobra por ti.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <article key={title}>
                <span>RUFO·{i + 1}</span>
                <Icon size={25} />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="rufo-cta">
            <Link className="rufo-button" to="/registro">
              Probar RUFO gratis <ArrowUpRight size={16} />
            </Link>
            <span className="rufo-nota">Sin tarjeta · 7 días completos</span>
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
            La emisión real se activa cuando tu empresa sube su firma
            electrónica (.p12), verifica su contraseña y completa sus datos
            fiscales; mientras tanto la emisión está en fase de validación y
            los comprobantes no tienen validez tributaria hasta activar el SRI
            real. MULTIFACTU no vende firmas electrónicas.
          </p>
          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Compara los planes</th>
                  <th>Inicial</th>
                  <th>Pro</th>
                  <th className="plan-lux">
                    Luxury <span className="lux-tag">RECOMENDADO</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Facturación electrónica y notas de crédito", 1, 1, 1],
                    ["Inventario, productos y servicios", 1, 1, 1],
                    ["Clientes y proformas con aprobación en línea", 1, 1, 1],
                    ["Comprobantes: XML, RIDE PDF, WhatsApp y correo", 1, 1, 1],
                    ["Alquiler con fechas, reservas y garantías", 0, 1, 1],
                    ["Caja, cobros, gastos y cuentas por cobrar", 0, 0, 1],
                    ["Facturación programada con IA", 0, 0, 1],
                    ["Asistente IA de reportes comerciales", 0, 0, 1],
                  ] as const
                ).map(([feature, ini, pro, lux]) => (
                  <tr key={feature}>
                    <td>{feature}</td>
                    {[ini, pro, lux].map((on, i) => (
                      <td key={i} className={i === 2 ? "col-lux" : ""}>
                        {on ? (
                          <span className="compare-check">
                            <Check size={13} />
                          </span>
                        ) : (
                          <span className="no">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="compare-price">
                  <td>Precio mensual (+ IVA)</td>
                  <td>$6,99</td>
                  <td>$11,99</td>
                  <td className="col-lux">$18,99</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="compare-sda">
            ¿Aún no tienes firma electrónica? Cómprala en{" "}
            <a
              href="https://www.securitydata.net.ec/firma-electronica-en-ecuador/"
              target="_blank"
              rel="noreferrer"
            >
              Security Data
            </a>{" "}
            y actívala en tu cuenta en minutos.
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
        <h2>La seguridad es nuestra ventaja competitiva</h2>
        <p className="trust-lead">
          No es un extra: es la base del sistema. Aislamiento de datos por
          empresa, firma electrónica cifrada y vigilancia 24/7 —{" "}
          <Link to="/seguridad">mira los 12 controles que aplicamos</Link>.
        </p>
        <div className="trust-grid">
          <article>
            <FileCheck2 size={26} />
            <h3>Claves de acceso SRI</h3>
            <p>
              Clave de acceso de 49 dígitos (módulo 11) y secuencias atómicas
              por establecimiento y punto de emisión.
            </p>
          </article>
          <article>
            <BadgeCheck size={26} />
            <h3>Estructura tributaria completa</h3>
            <p>
              IVA 0%, 5% y 15%, XML conforme al esquema del SRI v1.1.0 y RIDE
              en PDF listo para compartir.
            </p>
          </article>
          <article>
            <Lock size={26} />
            <h3>Tus datos aislados</h3>
            <p>
              Aislamiento por tenant con Row Level Security en todas las
              tablas: cada empresa solo accede a lo suyo.
            </p>
          </article>
          <article>
            <ServerCog size={26} />
            <h3>Infraestructura con controles</h3>
            <p>
              PostgreSQL, cifrado en tránsito (TLS) y certificados en
              almacenamiento privado.
            </p>
          </article>
        </div>
        <p className="scope-note">
          MULTIFACTU no vende firmas electrónicas ni declara respaldo oficial
          del SRI. La firma XAdES-BES se genera con tu propio certificado
          (.p12) y la autorización de cada comprobante depende del SRI.
        </p>
      </section>
      <footer>
        <Brand />
        <p>Sistema de facturación para ventas, alquileres y servicios en Ecuador.</p>
        <div>
          <Link to="/facturacion-electronica">Facturación electrónica</Link>
          <Link to="/inteligencia-negocios">Inteligencia de negocios</Link>
          <Link to="/seguridad">Seguridad</Link>
          <Link to="/terminos">Términos de servicio</Link>
          <Link to="/privacidad">Política de privacidad</Link>
          <Link to="/contrato-encargo">Contrato de encargo</Link>
          <Link to="/cookies">Política de cookies</Link>
          <Link to="/cumplimiento-legal">Cumplimiento legal</Link>
          <Link to="/reembolsos">Política de reembolsos</Link>
          <a href="tel:0987516088">0987516088</a>
        </div>
        <small>
          © 2026 MULTIFACTU · Sin respaldo oficial del SRI declarado
        </small>
      </footer>
      <WebChat />
    </div>
  );
}
