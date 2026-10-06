import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, FileText, KeyRound, ReceiptText, Send, ShieldCheck } from "lucide-react";
import MarketingFooter from "../components/MarketingFooter";
import MarketingHeader from "../components/MarketingHeader";

const steps = [
  { icon: ReceiptText, number: "01", title: "Configura tu empresa", text: "Registra los datos de tu negocio, RUC, establecimiento y punto de emisión. Esta información identifica el comprobante." },
  { icon: FileText, number: "02", title: "Crea la venta o el servicio", text: "Selecciona cliente, productos o servicios, cantidades e impuestos. El sistema organiza totales y el detalle de la operación." },
  { icon: KeyRound, number: "03", title: "Prepara la firma fiscal", text: "Para operar en producción, se valida una firma electrónica vigente cuyo RUC corresponda a tu empresa y se firma el XML en un servicio privado." },
  { icon: Send, number: "04", title: "Envía y conserva el comprobante", text: "Tras la autorización tributaria, podrás conservar el XML autorizado y compartir el RIDE con tu cliente desde su comprobante." },
];

export default function ElectronicInvoicing() {
  return <div className="marketing info-marketing">
    <MarketingHeader />
    <main className="info-main">
      <section className="info-hero">
        <div className="hero-pills">
          <p className="eyebrow">FACTURACIÓN ELECTRÓNICA</p>
          <span className="ai-tag">✦ IA integrada · RUFO</span>
        </div>
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
          <article className="ai-card"><h3>✦ Asistente IA integrado: RUFO</h3><p>Pregunta en español por ventas, deudores, caja e inventario: RUFO responde al instante con los datos reales de tu empresa, siempre aislados por negocio.</p></article>
        </div>
      </section>
    </main>
    <MarketingFooter />
  </div>;
}
