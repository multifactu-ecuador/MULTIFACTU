import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { LEGAL_UPDATED_DATE, PRIVACY_VERSION } from "../lib/legal";

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
        <p className="legal-meta">Vigencia: {LEGAL_UPDATED_DATE} · Versión: {PRIVACY_VERSION}</p>
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
          relevantes del servicio. Cuando se usa el asistente RUFO se tratan
          cifras agregadas del negocio, la memoria creada por el Cliente
          (perfil y hallazgos confirmados) y las valoraciones de respuestas,
          con la única finalidad de responder consultas y preparar análisis
          para ese Cliente; el Cliente puede borrar esa memoria en cualquier
          momento. Cuando el tratamiento se realice por cuenta
          del Cliente, seguimos sus instrucciones documentadas y no utilizamos
          esos datos para finalidades propias incompatibles. El consentimiento
          se solicita cuando sea la base aplicable; la ejecución del contrato,
          el cumplimiento de obligaciones legales y el interés legítimo de
          seguridad también pueden aplicar según el caso.
        </p>

        <h2>4. Destinatarios y subencargados</h2>
        <p>
          El acceso se limita a personal autorizado y proveedores necesarios
          para operar el servicio. Los subencargados actuales son:
        </p>
        <ul>
          <li><b>Supabase Inc.</b> (EE.UU.): autenticación, base de datos PostgreSQL, almacenamiento de archivos y funciones de servidor.</li>
          <li><b>Vercel Inc.</b> (EE.UU.): alojamiento de la aplicación web.</li>
          <li><b>NVIDIA Corp.</b> (NIM, EE.UU.): procesamiento puntual de las preguntas del asistente RUFO, junto con el contexto estrictamente necesario (cifras agregadas y memoria del asistente), para generar la respuesta; no se envían bases de datos completas ni se usan los datos para entrenar modelos.</li>
          <li><b>PayPhone</b> (Ecuador): procesamiento de pagos de planes, cuando el Cliente compra.</li>
          <li><b>Clerk Inc.</b> (EE.UU.): identidad y autenticación de la cuenta (correo, nombre y acceso con Google).</li>
        </ul>
        <p>
          Todo subencargado está sujeto a obligaciones de confidencialidad,
          seguridad y tratamiento compatibles con este documento. La contraseña
          del certificado de firma electrónica se almacena cifrada con
          Supabase Vault y jamás se guarda en texto plano.
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
          Aplicamos medidas técnicas y organizativas acordes al servicio:
          autenticación con contraseñas de mínimo 12 caracteres, controles de
          acceso por empresa y roles aplicados en la base de datos (Row Level
          Security) —incluida la memoria y los hallazgos del asistente—,
          aislamiento por inquilino, validación centralizada de origen, sesión
          y rol en cada función del servidor, límites de intentos y secretos
          compartidos firmados, cifrado en tránsito (TLS), almacenamiento
          privado para archivos, cifrado de la contraseña del certificado .p12
          con Supabase Vault y auditoría automática de dependencias con alertas
          de seguridad en cada actualización. Las preguntas al asistente RUFO
          se procesan de forma segura, no se comparten entre empresas ni se
          usan para entrenar modelos. Ningún sistema elimina todo riesgo: el
          Cliente debe proteger sus credenciales, limitar los permisos de su
          equipo y reportar incidentes sin demora.
        </p>

        <h2>8. Derechos y consultas</h2>
        <p>
          El titular puede ejercer los derechos reconocidos por la
          Constitución y por la Ley Orgánica de Protección de Datos
          Personales (Registro Oficial Suplemento 459 de 26 de mayo de 2021)
          y su Reglamento, incluidos acceso, rectificación y actualización,
          eliminación, oposición, suspensión, portabilidad y no ser objeto de
          decisiones automatizadas cuando correspondan. RUFO no toma decisiones
          automatizadas ni ejecuta acciones: sólo propone y el Cliente decide;
          ninguna sugerencia produce efectos por sí sola. Para datos de cuenta,
          escribe a <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>. Puedes además consultar o reclamar
          ante la Superintendencia de Protección de Datos Personales (SPDP),
          autoridad de control en Ecuador. Para datos cargados por un Cliente,
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
          Consulta la <Link to="/cookies">Política de cookies</Link>.
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
