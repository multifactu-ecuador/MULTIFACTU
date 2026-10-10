import { Link } from "react-router-dom";
import MarketingFooter from "../components/MarketingFooter";
import MarketingHeader from "../components/MarketingHeader";
import { LEGAL_UPDATED_DATE, REFUND_VERSION } from "../lib/legal";

/**
 * Política de reembolsos alineada con la Ley Orgánica de Defensa del
 * Consumidor de Ecuador (Ley 21, RO Suplemento 116 de 10-jul-2000, en su
 * reforma vigente: art. 45 → 15 días para servicios, cesación inmediata,
 * sin notas de crédito compensatorias) y con la extensión voluntaria a
 * treinta (30) días —más favorable al consumidor— concedida por
 * MULTIFACTU y ejecutada a través de Paddle (merchant of record). Forma
 * parte de los Términos de servicio.
 */
export default function RefundPolicy() {
  return (
    <div className="marketing legal">
      <MarketingHeader />
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Política de reembolsos</h1>
        <p className="legal-meta">Vigencia: {LEGAL_UPDATED_DATE} · Versión: {REFUND_VERSION}</p>
        <p className="notice">
          Esta política forma parte de los{" "}
          <Link to="/terminos">Términos de servicio</Link> y se aplica a la
          prueba gratuita y a los planes pagados de MULTIFACTU, conforme a la
          legislación de defensa del consumidor de la República del Ecuador.
        </p>

        <h2>1. Marco legal</h2>
        <p>
          Esta política se rige por la ley ecuatoriana, en particular la{" "}
          <b>Ley Orgánica de Defensa del Consumidor</b> (Ley 21, Registro
          Oficial Suplemento 116 de 10 de julio de 2000, en su reforma
          vigente), el Código Orgánico de la Producción, Comercio e
          Inversiones (COPCI) y la Ley de Comercio Electrónico, Firmas y
          Mensajes de Datos. Nada en este documento limita los derechos
          irrenunciables que la ley reconoce al consumidor.
        </p>

        <h2>2. Prueba gratuita (7 días)</h2>
        <p>
          La prueba de 7 días con hasta 10 facturas no requiere tarjeta ni
          genera cobro automático. Como no existe ningún pago que reembolsar,
          sobre la prueba no procede reembolso; basta con no contratar un plan
          para que el acceso se mantenga bloqueado al vencimiento, conservando
          tus datos.
        </p>

        <h2>3. Derecho de devolución (30 días)</h2>
        <p>
          Si contrataste un plan pagado, el artículo 45 de la Ley Orgánica de
          Defensa del Consumidor te reconoce el derecho de devolución dentro
          de los <b>quince (15) días naturales</b> siguientes a la recepción
          del servicio. MULTIFACTU extiende ese derecho, de manera voluntaria y
          más favorable para ti, a <b>treinta (30) días naturales</b>{" "}
          siguientes a la recepción del servicio, ejercible mediante la cesación
          inmediata del contrato. Ejercido ese derecho dentro del plazo,
          MULTIFACTU reembolsa el <b>100% de lo pagado en dinero</b> —sin notas
          de crédito ni bienes o servicios compensatorios—, a través del mismo
          medio de pago utilizado, dentro de un plazo máximo de{" "}
          <b>quince (15) días hábiles</b> desde la solicitud, previa
          verificación de la identidad de la cuenta y del pago.
        </p>

        <h2>4. Errores de cobro, montos incorrectos o pagos duplicados</h2>
        <p>
          Todo cobro por un monto distinto al informado, todo pago duplicado y
          todo cobro no autorizado se reembolsa por el 100% del valor, en
          cualquier momento en que se detecte y dentro de un máximo de quince
          (15) días hábiles, sin necesidad de invocar el plazo del artículo 45.
        </p>

        <h2>5. Comprobantes electrónicos ante el SRI</h2>
        <p>
          Si por el pago reembolsado se hubiera emitido un comprobante
          electrónico autorizado por el SRI, MULTIFACTU emitirá primero la
          nota de crédito o corrección que corresponda conforme a la normativa
          tributaria y, enseguida, procesará el reembolso en dinero. El
          reembolso no sustituye las obligaciones fiscales del Cliente ni
          anula comprobantes por sí solo.
        </p>

        <h2>6. Cancelación y períodos utilizados</h2>
        <p>
          Cancelar impide renovaciones futuras, pero no elimina obligaciones de
          pago ya causadas. Fuera del plazo de treinta (30) días del derecho de
          devolución, los períodos mensuales efectivamente iniciados no son
          reembolsables; los planes de período mayor se reembolsan de forma
          proporcional por los meses restantes no utilizados. Esto complementa
          —y nunca contradice— la cláusula de planes de los Términos de
          servicio.
        </p>

        <h2>7. Cómo solicitar un reembolso</h2>
        <p>
          Escribe a <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>{" "}
          o llama al <a href="tel:0987516088">0987516088</a>, indicando el
          correo de la cuenta, el motivo, el comprobante de pago y el medio de
          pago utilizado. MULTIFACTU se pronuncia en un máximo de tres (3)
          días hábiles y, si procede, ejecuta el reembolso dentro de los
          quince (15) días hábiles señalados.
        </p>

        <h2>8. Ley aplicable, jurisdicción y defensa del consumidor</h2>
        <p>
          Se aplica la ley de la República del Ecuador. El domicilio del
          proveedor es Vergeles Mz. 235, Solar 6-5, Guayaquil, y las
          controversias se someten a los juzgados y tribunales de Guayaquil,
          sin perjuicio de que el consumidor pueda acudir en cualquier momento
          a la Defensoría del Pueblo (Defensoría Adjunta del Consumidor y
          Usuario) u otros mecanismos legales de defensa de sus derechos.
        </p>

        <h2>9. Cambios y contacto</h2>
        <p>
          Los cambios de esta política se publican en esta misma página con su
          versión y vigencia, y se comunican por medios razonables cuando
          correspondan. Para consultas:{" "}
          <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a> ·{" "}
          <a href="tel:0987516088">0987516088</a> ·{" "}
          <Link to="/terminos">Términos de servicio</Link> ·{" "}
          <Link to="/privacidad">Política de privacidad</Link>.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
