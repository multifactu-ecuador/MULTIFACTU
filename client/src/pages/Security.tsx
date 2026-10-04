import { Link } from "react-router-dom";
import { ArrowRight, Database, FileCheck2, KeyRound, Lock, ServerCog, ShieldCheck } from "lucide-react";
import Brand from "../components/Brand";

const controls = [
  { icon: ShieldCheck, title: "Datos separados por empresa", text: "Cada cuenta trabaja en un espacio independiente. Las reglas de acceso de la base de datos evitan que una empresa consulte la información de otra." },
  { icon: Lock, title: "Acceso con sesión protegida", text: "Las operaciones se realizan con una sesión autenticada y permisos por rol. Solo los administradores pueden realizar cambios sensibles de la empresa." },
  { icon: KeyRound, title: "Firma electrónica protegida", text: "El flujo de firma está diseñado para validar el archivo .p12 y cifrar su contenido antes de guardarlo. La clave y la contraseña se usan únicamente durante la firma, en el backend privado." },
  { icon: Database, title: "Información con controles de acceso", text: "Clientes, comprobantes, inventario y finanzas se relacionan con tu empresa y se consultan bajo controles de aislamiento por tenant." },
  { icon: ServerCog, title: "Procesos sensibles fuera del navegador", text: "El navegador no debe recibir claves maestras, contraseñas de certificados ni archivos P12. Esos procesos pertenecen a servicios privados del servidor." },
  { icon: FileCheck2, title: "Validaciones antes de firmar", text: "La preparación fiscal comprueba la vigencia del certificado y que su RUC o cédula coincida con la empresa antes de permitir una firma real." },
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
        <div className="security-grid">{controls.map(({ icon: Icon, title, text }) => <article key={title}><Icon size={25} /><h3>{title}</h3><p>{text}</p></article>)}</div>
      </section>
      <section className="info-banner"><ShieldCheck size={28} /><div><h2>Seguridad verificable, no promesas vacías.</h2><p>Nunca debes compartir tu contraseña de firma por WhatsApp ni enviarla por correo. Cárgala únicamente desde el proceso seguro de tu cuenta.</p></div></section>
      <section className="info-section info-faq">
        <p className="eyebrow">PREGUNTAS FRECUENTES</p>
        <div>
          <article><h3>¿Otra empresa puede ver mis comprobantes?</h3><p>No. Los datos se consultan dentro del espacio de la empresa autenticada.</p></article>
          <article><h3>¿Dónde se usa mi firma electrónica?</h3><p>Solo en el proceso privado de firmado cuando habilitas el flujo fiscal real; no se entrega al navegador.</p></article>
          <article><h3>¿Qué debo hacer si cambia mi certificado?</h3><p>Actualízalo desde la configuración de la empresa antes de que venza y confirma que el RUC del certificado sea el correcto.</p></article>
        </div>
      </section>
    </main>
    <footer><Brand /><p>Ventas, alquileres, servicios y mantenimiento para Ecuador.</p><div><Link to="/facturacion-electronica">Facturación electrónica</Link><Link to="/inteligencia-negocios">Inteligencia de negocios</Link><Link to="/terminos">Términos de servicio</Link><Link to="/privacidad">Política de privacidad</Link><Link to="/contrato-encargo">Contrato de encargo</Link></div><small>© 2026 MULTIFACTU · Seguridad explicada de forma transparente.</small></footer>
  </div>;
}
