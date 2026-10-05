import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { COMPLIANCE_VERSION, LEGAL_UPDATED_DATE } from "../lib/legal";

export default function CumplimientoLegal() {
  return (
    <div className="marketing legal">
      <header>
        <Brand />
        <Link className="button light" to="/registro">Crear cuenta</Link>
      </header>
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Cumplimiento legal y medios de recurso (Ecuador y SRI)</h1>
        <p className="legal-meta">Vigencia: {LEGAL_UPDATED_DATE} · Versión: {COMPLIANCE_VERSION}</p>

        <h2>1. Marco normativo aplicable</h2>
        <ul>
          <li>
            <b>Ley de Régimen Tributario Interno y su Reglamento:</b> emisión y
            conservación de comprobantes de venta y retención, numeración
            correlativa y plazos.
          </li>
          <li>
            <b>Código Tributario:</b> obligaciones formales del contribuyente y
            los medios de recurso frente a los actos de la administración
            tributaria.
          </li>
          <li>
            <b>Resoluciones y directrices del SRI</b> vigentes en materia de
            facturación electrónica, firmas y validación de comprobantes.
          </li>
          <li>
            <b>Ley de Comercio Electrónico, Firmas y Mensajes de Datos:</b>
            validez de los mensajes y firmas electrónicas.
          </li>
          <li>
            <b>Ley Orgánica de Protección de Datos Personales:</b> tratamiento
            de datos personales (ver la <Link to="/privacidad">Política de
            privacidad</Link>).
          </li>
          <li>
            <b>Ley de Defensa del Consumidor:</b> información veraz y vías de
            reclamo para el usuario final.
          </li>
        </ul>

        <h2>2. Rol de MULTIFACTU</h2>
        <p>
          MULTIFACTU es una herramienta tecnológica: no es el SRI, no representa
          al SRI ni garantiza la autorización de comprobantes. La información
          fiscal que registres es responsabilidad tuya —datos exactos,
          certificado .p12 vigente y conservación de tus documentos conforme a
          la normativa—, tal como se detalla en los{" "}
          <Link to="/terminos">Términos de servicio</Link>.
        </p>

        <h2>3. Medios de recurso ante actos del SRI</h2>
        <p>
          Los rechazos, requerimientos o liquidaciones son actos del SRI. Contra
          ellos puedes ejercer los medios de recurso previstos en el Código
          Tributario —recurso de reposición y apelación— dentro de los plazos que
          esa ley establece, directamente ante el SRI. MULTIFACTU te apoyará con
          la información y los comprobantes que obren en el sistema.
        </p>

        <h2>4. Medios de recurso ante MULTIFACTU</h2>
        <p>
          Para reclamos sobre el servicio: soporte dentro de la aplicación o{" "}
          <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>, con
          respuesta en un plazo razonable. Si no quedas conforme, puedes acudir
          a las autoridades de defensa del consumidor competentes conforme a la
          Ley de Defensa del Consumidor o a los tribunales de la República del
          Ecuador, según los Términos de servicio.
        </p>

        <h2>5. Cambios normativos</h2>
        <p>
          Cuando el SRI o la normativa cambien, MULTIFACTU adaptará el sistema y
          te avisaremos cuando el cambio requiera tu acción —por ejemplo,
          actualizar tu certificado o parámetros fiscales—. Tú mantienes
          vigente tu configuración.
        </p>

        <h2>6. Conservación de documentos</h2>
        <p>
          Conserva tus comprobantes y registros por los plazos que fije la
          normativa tributaria ecuatoriana; el sistema te permite exportar tus
          datos en cualquier momento.
        </p>

        <p>
          Contacto: <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a> ·{" "}
          <a href="tel:0987516088">0987516088</a> ·{" "}
          <Link to="/seguridad">Seguridad del sistema</Link> ·{" "}
          <Link to="/politica-seguridad">Política de seguridad</Link>
        </p>
      </main>
    </div>
  );
}
