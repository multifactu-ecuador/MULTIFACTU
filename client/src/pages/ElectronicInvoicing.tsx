import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, KeyRound, ReceiptText, Send, ShieldCheck } from "lucide-react";
import Brand from "../components/Brand";

const steps = [
  { icon: ReceiptText, number: "01", title: "Configura tu empresa", text: "Registra los datos de tu negocio, RUC, establecimiento y punto de emisión. Esta información identifica el comprobante." },
  { icon: FileText, number: "02", title: "Crea la venta o el servicio", text: "Selecciona cliente, productos o servicios, cantidades e impuestos. El sistema organiza totales y el detalle de la operación." },
  { icon: KeyRound, number: "03", title: "Prepara la firma fiscal", text: "Para operar en producción, se valida una firma electrónica vigente cuyo RUC corresponda a tu empresa y se firma el XML en un servicio privado." },
  { icon: Send, number: "04", title: "Envía y conserva el comprobante", text: "Tras la autorización tributaria, podrás conservar el XML autorizado y compartir el RIDE con tu cliente desde su comprobante." },
];

export default function ElectronicInvoicing() {
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
        <p className="eyebrow">FACTURACIÓN ELECTRÓNICA</p>
        <h1>De una venta a un comprobante, paso a paso.</h1>
        <p>Organiza la información de la venta, prepara el comprobante y mantén un historial claro para tu empresa y tus clientes.</p>
        <div className="info-actions"><Link className="button light" to="/registro">Probar MULTIFACTU <ArrowRight size={17} /></Link><Link to="/seguridad">Cómo protegemos tu firma</Link></div>
      </section>
      <section className="info-section">
        <div className="info-section-heading"><p className="eyebrow">ASÍ FUNCIONA</p><h2>Un flujo pensado para que no pierdas el control.</h2></div>
        <ol className="invoicing-steps">{steps.map(({ icon: Icon, number, title, text }) => <li key={number}><span>{number}</span><Icon size={24} /><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol>
      </section>
      <section className="info-banner info-banner-warning"><CheckCircle2 size={28} /><div><h2>Importante: NO vendemos firmas electrónicas.</h2><p>MULTIFACTU es el sistema que prepara, firma y envía tus comprobantes, pero <b>no vendemos ni emitimos firmas electrónicas</b>. Tu empresa debe adquirir su certificado (.p12) en una entidad autorizada por el SRI. Una vez que la tengas, la subes a tu cuenta, verificas su contraseña y listo: emitirás en modo real. La autorización de cada comprobante depende del SRI y de la validez de tus datos.</p><a className="sda-cta" href="https://www.securitydata.net.ec/firma-electronica-en-ecuador/" target="_blank" rel="noreferrer"><ShieldCheck size={17} /> ¿No tienes firma electrónica? Cómprala en Security Data →</a></div></section>
      <section className="info-section info-faq">
        <p className="eyebrow">LO QUE ENCUENTRAS EN TU CUENTA</p>
        <div>
          <article><h3>Clientes y datos fiscales ordenados</h3><p>Consulta el historial del cliente y utiliza sus datos al preparar futuras operaciones.</p></article>
          <article><h3>Impuestos y totales visibles</h3><p>Revisa subtotales, descuentos e IVA antes de confirmar la operación.</p></article>
          <article><h3>Comprobantes y RIDE</h3><p>Consulta el estado de cada documento y descarga su representación cuando esté disponible.</p></article>
        </div>
      </section>
    </main>
    <footer><Brand /><p>Sistema de facturación para ventas, alquileres y servicios en Ecuador.</p><div><Link to="/inteligencia-negocios">Inteligencia de negocios</Link><Link to="/seguridad">Seguridad</Link><Link to="/terminos">Términos de servicio</Link><Link to="/privacidad">Política de privacidad</Link><Link to="/contrato-encargo">Contrato de encargo</Link><Link to="/cookies">Política de cookies</Link><Link to="/cumplimiento-legal">Cumplimiento legal</Link></div><small>© 2026 MULTIFACTU · Emisión real sujeta a configuración y validación fiscal.</small></footer>
  </div>;
}
