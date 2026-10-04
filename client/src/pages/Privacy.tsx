import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { LEGAL_EFFECTIVE_DATE, PRIVACY_VERSION } from "../lib/legal";

export default function Privacy() {
  return (
    <div className="marketing legal">
      <header>
        <Brand />
        <Link className="button light" to="/registro">Crear cuenta</Link>
      </header>
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Política de privacidad</h1>
        <p className="legal-meta">Vigencia: {LEGAL_EFFECTIVE_DATE} · Versión: {PRIVACY_VERSION}</p>
        <p className="notice">
          Completa antes de publicar: [razón social], [RUC] y la lista de
          subencargados. Esta política no
          sustituye la revisión de un profesional de protección de datos.
        </p>

        <h2>1. Responsable y alcance</h2>
        <p>
          Para los datos de contacto de la cuenta, relación contractual,
          facturación del servicio, seguridad y soporte, el responsable del
          tratamiento es [razón social del proveedor], RUC [RUC del proveedor],
          con domicilio en Vergeles Mz. 235, Solar 6-5, Guayaquil, Ecuador
          ("MULTIFACTU"). Para los datos que el
          Cliente incorpora a su operación —por ejemplo, información de sus
          clientes, proveedores, personal o comprobantes—, el Cliente actúa
          como responsable y MULTIFACTU como encargado, conforme al <Link to="/contrato-encargo">Contrato
          de encargo de tratamiento</Link>.
        </p>

        <h2>2. Datos que se tratan</h2>
        <p>
          Podemos tratar datos de identificación y contacto, datos de la
          empresa, RUC o cédula, credenciales y eventos de seguridad de la
          cuenta, información de suscripción y pago, así como los datos
          operativos que el Cliente registre en la plataforma. No solicites ni
          cargues categorías especiales de datos personales si no son
          necesarias para la finalidad del servicio y no cuentas con una base
          jurídica válida.
        </p>

        <h2>3. Finalidades y bases de tratamiento</h2>
        <p>
          Tratamos los datos para crear y administrar la cuenta, prestar el
          servicio contratado, autenticar accesos, atender soporte, prevenir
          fraude e incidentes, cumplir obligaciones legales y comunicar cambios
          relevantes del servicio. Cuando el tratamiento se realice por cuenta
          del Cliente, seguimos sus instrucciones documentadas y no utilizamos
          esos datos para finalidades propias incompatibles. El consentimiento
          se solicita cuando sea la base aplicable; la ejecución del contrato,
          el cumplimiento de obligaciones legales y el interés legítimo de
          seguridad también pueden aplicar según el caso.
        </p>

        <h2>4. Destinatarios y subencargados</h2>
        <p>
          El acceso se limita a personal autorizado y proveedores necesarios
          para operar el servicio. La configuración actual utiliza servicios de
          Supabase para autenticación, base de datos y almacenamiento. Todo
          subencargado deberá estar sujeto a obligaciones de confidencialidad,
          seguridad y tratamiento compatibles con este documento. La lista
          actualizada de subencargados y sus ubicaciones debe publicarse en
          [URL de subencargados] antes de la puesta en producción.
        </p>

        <h2>5. Transferencias internacionales</h2>
        <p>
          Si un proveedor procesa datos fuera de Ecuador, MULTIFACTU y el
          Cliente aplicarán las garantías, información y mecanismos exigidos por
          la normativa aplicable antes de la transferencia o comunicación. El
          Cliente puede solicitar información sobre los subencargados y las
          medidas aplicables a través de <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>.
        </p>

        <h2>6. Conservación y cierre de cuenta</h2>
        <p>
          Conservamos los datos mientras sean necesarios para prestar el
          servicio, atender obligaciones legales, resolver reclamaciones o
          defender derechos. Los datos operativos del Cliente se conservarán y
          devolverán o eliminarán conforme a sus instrucciones, al Contrato de
          encargo y a los períodos legales obligatorios. Antes de anunciar un
          plazo específico, MULTIFACTU debe publicar su calendario de retención
          y su proceso de exportación o eliminación.
        </p>

        <h2>7. Seguridad</h2>
        <p>
          Aplicamos medidas técnicas y organizativas acordes al servicio, como
          autenticación, controles de acceso por empresa y roles, aislamiento
          de datos mediante reglas de base de datos y almacenamiento privado
          para archivos configurados como privados. Ningún sistema elimina todo
          riesgo: el Cliente debe proteger sus credenciales, limitar los
          permisos de su equipo y reportar incidentes sin demora.
        </p>

        <h2>8. Derechos y consultas</h2>
        <p>
          El titular puede ejercer los derechos reconocidos por la normativa
          aplicable, incluidos acceso, rectificación y actualización,
          eliminación, oposición, suspensión, portabilidad y no ser objeto de
          decisiones automatizadas cuando correspondan. Para datos de cuenta,
          escribe a <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>. Para datos cargados por un Cliente,
          el titular debe dirigir inicialmente su solicitud a ese Cliente como
          responsable del tratamiento; MULTIFACTU le asistirá según el Contrato
          de encargo.
        </p>

        <h2>9. Cookies y cambios</h2>
        <p>
          La aplicación puede usar almacenamiento técnico necesario para
          autenticar la sesión y mantener funciones esenciales. Antes de usar
          cookies o tecnologías no esenciales, MULTIFACTU deberá informar su
          finalidad y obtener las elecciones que exija la normativa aplicable.
          Informaremos los cambios relevantes de esta Política por medios
          razonables y, cuando corresponda, solicitaremos una nueva aceptación.
        </p>

        <p>
          Para asuntos de privacidad: <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a> · <a href="tel:0987516088">0987516088</a> ·
          <Link to="/terminos"> Términos de servicio</Link>.
        </p>
      </main>
    </div>
  );
}
