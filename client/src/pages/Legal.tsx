import { Link } from "react-router-dom";
import MarketingFooter from "../components/MarketingFooter";
import MarketingHeader from "../components/MarketingHeader";
import { LEGAL_EFFECTIVE_DATE, TERMS_VERSION } from "../lib/legal";
export default function Legal() {
  return (
    <div className="marketing legal">
      <MarketingHeader />
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Términos de servicio</h1>
        <p className="legal-meta">Vigencia: {LEGAL_EFFECTIVE_DATE} · Versión: {TERMS_VERSION}</p>
        <p className="notice">
          Antes de publicar, completa los campos entre corchetes con la razón
          social, RUC y lista de subencargados de la empresa que opera
          MULTIFACTU. Este texto es una base operativa y requiere
          revisión jurídica para tu modelo comercial concreto.
        </p>
        <h2>1. Quién presta el servicio y aceptación</h2>
        <p>
          MULTIFACTU es una plataforma SaaS operada por [razón social del
          proveedor], RUC [RUC del proveedor], con domicilio en Vergeles Mz.
          235, Solar 6-5, Guayaquil, Ecuador ("MULTIFACTU", "nosotros" o el
          "Proveedor"). Al crear una
          cuenta, contratar un plan o usar la plataforma, la persona que actúa
          por la empresa cliente declara tener facultades suficientes para
          obligarla y acepta estos Términos y la <Link to="/privacidad">Política
          de privacidad</Link>. La aceptación se registra con fecha y versión
          del documento.
        </p>
        <h2>2. Objeto y alcance</h2>
        <p>
          MULTIFACTU permite organizar ventas, clientes, inventario,
          alquileres, cuentas y reportes, según el plan contratado. Incluye
          cotizaciones (proformas) con aprobación en línea que generan la
          factura automáticamente, facturación programada recurrente y un
          asistente de inteligencia artificial que responde preguntas con los
          datos del negocio. Las funciones disponibles, límites de uso, precio
          e impuestos aplicables son los informados en la oferta vigente al
          contratar. El Cliente es responsable de verificar que la plataforma
          y el plan cubran sus necesidades antes de utilizarla en su operación.
        </p>
        <h2>3. Facturación electrónica</h2>
        <p>
          Cuando el Cliente complete la configuración fiscal —incluyendo RUC,
          certificado .p12 vigente cuya contraseña se verifica contra el propio
          certificado, establecimiento, punto de emisión y el ambiente
          habilitado—, MULTIFACTU puede preparar, firmar y enviar comprobantes
          electrónicos al SRI. MULTIFACTU <b>no vende firmas electrónicas</b>:
          el Cliente debe adquirir su certificado en una entidad autorizada por
          el SRI. La autorización, rechazo u otra respuesta de cada comprobante
          depende exclusivamente del SRI y de la validez de la información
          proporcionada por el Cliente. MULTIFACTU no declara afiliación,
          respaldo oficial ni garantía de autorización automática por parte
          del SRI. Mientras la configuración fiscal esté incompleta, las
          operaciones quedan en fase de validación y carecen de validez
          tributaria.
        </p>
        <h2>4. Cuenta, seguridad y responsabilidades del Cliente</h2>
        <p>
          El Cliente debe proporcionar información exacta, mantener sus
          credenciales confidenciales, asignar roles de acceso únicamente a
          personas autorizadas y comunicar de inmediato cualquier uso no
          autorizado. También responde por la licitud, exactitud y actualización
          de los datos, documentos, comprobantes, productos, clientes y demás
          contenido que registre, así como por conservar la documentación que
          la normativa aplicable le exija.
        </p>
        <h2>5. Planes, prueba, pagos y cancelación</h2>
        <p>
          La prueba gratuita dura 7 días con todas las funciones del plan
          superior (Luxury) y permite emitir hasta 10 facturas. No genera cobro
          automático. Al agotarse el tiempo o el cupo de facturas, las
          operaciones se bloquean hasta elegir un plan; los datos registrados
          se conservan. Un plan pagado se activa únicamente después de la
          confirmación del medio de pago correspondiente. La cancelación evita
          renovaciones futuras, pero no elimina de forma automática obligaciones
          de pago ya causadas ni genera un reembolso de períodos efectivamente
          utilizados, salvo que la ley aplicable disponga otra cosa. Los
          reembolsos se rigen por la <Link to="/reembolsos">Política de
          reembolsos</Link>, que forma parte integrante de estos Términos.
        </p>
        <p>
          Los cobros de los planes los procesa <b>Paddle</b> (Paddle.com Market
          Limited), que actúa como comerciante del registro (<i>Merchant of
          Record</i>) del pago. En consecuencia, el pago se realiza
          directamente ante Paddle, que emite el comprobante correspondiente,
          tramita y declara los impuestos aplicables conforme a su condición de
          comerciante y ejecuta los reembolsos conforme a la política
          aplicable. El descriptor que aparece en el extracto bancario es
          «MULTIFACTU». La suscripción, el acceso y los datos del negocio
          siguen siendo de MULTIFACTU; el Cliente puede gestionar su plan y su
          método de pago desde su cuenta o mediante el portal de cliente que
          Paddle envía por correo.
        </p>
        <h2>6. RUFO, asistente de inteligencia artificial</h2>
        <p>
          RUFO responde consultas con los datos del negocio del Cliente
          (ventas, cobros, caja e inventario) y con el conocimiento de la
          plataforma. Con esos mismos datos analiza periódicamente el negocio
          y propone hallazgos —riesgos y oportunidades— que el Cliente
          confirma o descarta, y guarda la memoria que autoriza (perfil y
          hallazgos confirmados) junto con las valoraciones de respuestas.
          Todo queda aislado por empresa: los datos de una cuenta no alimentan
          a otra, no se usan para entrenar modelos ni se comparten. Las
          preguntas pueden procesarse con un proveedor de IA (NVIDIA NIM)
          únicamente para generar la respuesta. RUFO <b>sugiere, no decide</b>:
          no emite comprobantes ni ejecuta acciones, y sus respuestas son
          informativas, sin sustituir asesoría contable, tributaria o legal
          profesional.
        </p>
        <h2>7. Datos personales y confidencialidad</h2>
        <p>
          El tratamiento de datos personales se rige por la <Link to="/privacidad">Política
          de privacidad</Link> y, cuando MULTIFACTU trate datos personales por
          cuenta del Cliente, por el <Link to="/contrato-encargo">Contrato de
          encargo de tratamiento</Link>. El Cliente acepta que el contrato de
          encargo se incorpora a estos Términos respecto de los datos de sus
          propios clientes, proveedores, personal y demás titulares que cargue
          al servicio.
        </p>
        <h2>8. Disponibilidad, soporte y cambios</h2>
        <p>
          El Proveedor puede realizar mantenimiento, correcciones, mejoras de
          seguridad o cambios razonables en el servicio. Procurará informar con
          antelación cuando una intervención programada pueda afectar de forma
          relevante el uso. El Cliente debe mantener copias y procedimientos
          internos adecuados para su operación; no se ofrece disponibilidad,
          respaldo ni recuperación ilimitados salvo que se pacten expresamente
          por escrito.
        </p>
        <h2>9. Uso permitido y suspensión</h2>
        <p>
          No está permitido usar el servicio para actividades ilícitas,
          fraudulentas, que vulneren derechos de terceros, que intenten eludir
          controles de acceso o que afecten la seguridad, estabilidad o
          integridad de la plataforma. MULTIFACTU podrá limitar o suspender el
          acceso cuando resulte necesario para investigar incidentes, proteger
          el servicio, cumplir una obligación legal o ante un incumplimiento
          material, comunicándolo cuando sea razonablemente posible.
        </p>
        <h2>10. Propiedad intelectual y contenido</h2>
        <p>
          El software, marca, diseño y materiales de MULTIFACTU permanecen bajo
          titularidad del Proveedor o sus licenciantes. El Cliente conserva la
          titularidad y responsabilidad sobre su contenido y otorga al
          Proveedor una autorización limitada para tratarlo exclusivamente con
          la finalidad de prestar, proteger y mantener el servicio.
        </p>
        <h2>11. Vigencia, terminación y ley aplicable</h2>
        <p>
          Estos Términos permanecen vigentes mientras el Cliente use el
          servicio o mantenga obligaciones pendientes. Las solicitudes de
          cierre, exportación, devolución o eliminación de datos se gestionan
          conforme a la Política de privacidad, el Contrato de encargo y las
          obligaciones legales de conservación aplicables. Se aplica la ley de
          la República del Ecuador —en particular la Ley Orgánica de Defensa
          del Consumidor, el COPCI y la Ley de Comercio Electrónico, Firmas y
          Mensajes de Datos—. Las partes procurarán resolver cualquier
          controversia de buena fe antes de acudir a la autoridad competente.
          El domicilio del Proveedor es Guayaquil y las controversias se
          someten a sus juzgados y tribunales, sin perjuicio de los
          mecanismos de defensa del consumidor, entre ellos la Defensoría del
          Pueblo.
        </p>
        <h2>12. Actualizaciones y contacto</h2>
        <p>
          MULTIFACTU podrá actualizar estos Términos cuando cambie el servicio,
          la normativa o sus prácticas. Una modificación material se comunicará
          por medios razonables y, cuando corresponda, se solicitará una nueva
          aceptación. Para consultas contractuales escribe a <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>
          o comunícate al <a href="tel:0987516088">0987516088</a>.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
