import { Link } from "react-router-dom";
import { ArrowRight, Brain, Database, FileCheck2, Gauge, Globe, KeyRound, ListChecks, Lock, ServerCog, ShieldCheck, Webhook, Workflow } from "lucide-react";
import Brand from "../components/Brand";

const controls = [
  { icon: ShieldCheck, title: "Datos separados por empresa", text: "Cada cuenta trabaja en un espacio independiente. Las reglas de la base de datos (Row Level Security) impiden que una empresa consulte la información de otra, incluso llamando directo a la API." },
  { icon: Lock, title: "Acceso con sesión protegida", text: "Sesión autenticada, contraseñas de mínimo 12 caracteres y roles ADMIN/CAJERO. Los permisos por plan los aplica PostgreSQL: no se pueden saltar desde el navegador." },
  { icon: KeyRound, title: "Contraseña del .p12 cifrada en Vault", text: "La contraseña de tu firma se guarda cifrada con Supabase Vault (pgsodium). Nunca existe en texto plano: solo el backend la descifra en memoria durante la firma, y el botón «Verificar contraseña» la comprueba contra tu certificado real antes de guardarla." },
  { icon: Database, title: "Información con controles de acceso", text: "Clientes, comprobantes, inventario y finanzas se relacionan con tu empresa. Las operaciones de dinero usan tokens idempotentes: ni un doble clic ni una recarga duplican cobros." },
  { icon: ServerCog, title: "Procesos sensibles fuera del navegador", text: "El navegador nunca recibe contraseñas de certificados, archivos .p12 ni claves. Firma, verificación y envío al SRI ocurren en funciones privadas del servidor con límites anti fuerza-bruta." },
  { icon: FileCheck2, title: "Validaciones antes de firmar", text: "Antes de firmar se comprueba que la contraseña abra el certificado, que esté vigente y que su RUC o cédula corresponda a tu empresa." },
  { icon: Brain, title: "IA por empresa, memoria aislada", text: "RUFO sólo lee los datos de tu empresa: su memoria y sus hallazgos viven separados por empresa en la base de datos, los confirmas tú y jamás se usan para entrenar modelos ni alimentan a otras cuentas." },
  { icon: Gauge, title: "Límites en cada función", text: "Cada endpoint valida origen, sesión, rol y secreto antes de responder, con cupo de intentos en firma, emisiones y consultas: ni fuerza bruta ni abuso de la API." },
  { icon: Workflow, title: "Seguridad auditada en cada cambio", text: "Cada actualización pasa pruebas automáticas de base de datos y una auditoría de dependencias con alertas de seguridad; las vulnerabilidades conocidas se revisan con fecha límite." },
  { icon: Webhook, title: "Eventos firmados y tareas protegidas", text: "Los webhooks y tareas automáticas exigen un secreto compartido: nada entra al sistema sin validarse y los intentos quedan registrados." },
  { icon: Globe, title: "Cifrado en tránsito (HTTPS)", text: "Toda la comunicación entre tu navegador y el sistema viaja cifrada con TLS: ni en redes públicas ni en redes privadas puede alguien leer tus datos en el camino." },
  { icon: ListChecks, title: "Datos validados antes de guardarse", text: "Los formularios validan formato, tipo y tamaño de archivos y longitudes antes de enviar: la información inconsistente nunca entra a la base de datos." },
];

export default function Security() {
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
      <section className="info-hero">
        <p className="eyebrow">SEGURIDAD Y PRIVACIDAD</p>
        <h1>Tu información empresarial merece controles claros.</h1>
        <p>MULTIFACTU está diseñado para separar los datos de cada empresa, limitar los accesos y mantener los procesos fiscales sensibles fuera del navegador.</p>
        <div className="info-actions"><Link className="button light" to="/registro">Crear cuenta gratis <ArrowRight size={17} /></Link><Link to="/privacidad">Ver política de privacidad</Link></div>
      </section>
      <section className="info-section">
        <div className="info-section-heading"><p className="eyebrow">CATÁLOGO DE SEGURIDAD</p><h2>Cómo protegemos cada parte del sistema.</h2></div>
        <div className="security-grid">{controls.map(({ icon: Icon, title, text }) => <article key={title}><Icon size={25} /><h3>{title}</h3><p>{text}</p></article>)}
          <article className="security-ally">
            <div className="security-ally-brand"><img src="/brands/clerk-wordmark-blanco.png" alt="Clerk" height="28" /><span>ALIADO EN SEGURIDAD</span></div>
            <div><h3>Tu identidad la gestiona Clerk</h3><p>Inicio de sesión, verificación de correo, recuperación de contraseña y límites contra fuerza bruta los gestionamos con Clerk, empresa especializada en autenticación. El servidor valida cada sesión antes de consultar o modificar cualquier dato de tu empresa.</p></div>
          </article>
          <article className="security-ally">
            <div className="security-ally-brand"><img src="/brands/betterstack.svg" alt="Better Stack" height="28" /><span>ALIADO EN SEGURIDAD</span></div>
            <div><h3>Disponibilidad vigilada con Better Stack</h3><p>Nuestra web, las funciones de API y el flujo de emisión SRI se comprueban cada 3 minutos desde Better Stack: si algo cae, hay alerta en minutos y la incidencia queda publicada en la página de estado.</p></div>
          </article>
        </div>
      </section>
      <section className="info-banner"><ShieldCheck size={28} /><div><h2>Seguridad verificable, no promesas vacías.</h2><p>Cada función del servidor valida origen, sesión y rol antes de responder; la firma electrónica jamás sale de procesos privados y su contraseña vive cifrada en Vault. RUFO, el asistente de IA, trabaja solo con los datos de tu empresa —memoria que tú controlas—, nunca con los de otras cuentas ni para entrenar modelos. Nunca compartas la contraseña de tu firma por WhatsApp ni correo: cárgala solo desde «Mi empresa» y verifícala con el botón correspondiente. Documento completo: <Link to="/politica-seguridad">Política de seguridad de la información</Link>.</p></div></section>
      <section className="info-section info-faq">
        <p className="eyebrow">PREGUNTAS FRECUENTES</p>
        <div>
          <article><h3>¿Otra empresa puede ver mis comprobantes?</h3><p>No. Los datos se consultan dentro del espacio de la empresa autenticada.</p></article>
          <article><h3>¿Dónde se usa mi firma electrónica?</h3><p>Solo en el proceso privado de firmado cuando habilitas el flujo fiscal real; no se entrega al navegador.</p></article>
          <article><h3>¿Qué debo hacer si cambia mi certificado?</h3><p>Actualízalo desde la configuración de la empresa antes de que venza y confirma que el RUC del certificado sea el correcto.</p></article>
          <article><h3>¿RUFO aprende de otros usuarios?</h3><p>No. Sus recuerdos y hallazgos son de tu empresa, se confirman manualmente y no se usan para entrenar modelos ni se comparten entre cuentas.</p></article>
        </div>
      </section>
    </main>
    <footer><Brand /><p>Sistema de facturación para ventas, alquileres y servicios en Ecuador.</p><div><Link to="/facturacion-electronica">Facturación electrónica</Link><Link to="/inteligencia-negocios">Inteligencia de negocios</Link><Link to="/terminos">Términos de servicio</Link><Link to="/privacidad">Política de privacidad</Link><Link to="/contrato-encargo">Contrato de encargo</Link><Link to="/cookies">Política de cookies</Link><Link to="/cumplimiento-legal">Cumplimiento legal</Link><Link to="/reembolsos">Política de reembolsos</Link></div><small>© 2026 MULTIFACTU · Seguridad explicada de forma transparente.</small></footer>
  </div>;
}
