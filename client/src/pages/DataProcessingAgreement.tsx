import { Link } from "react-router-dom";
import MarketingFooter from "../components/MarketingFooter";
import MarketingHeader from "../components/MarketingHeader";
import { DATA_PROCESSING_VERSION, LEGAL_EFFECTIVE_DATE } from "../lib/legal";

export default function DataProcessingAgreement() {
  return (
    <div className="marketing legal">
      <MarketingHeader />
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Contrato de encargo de tratamiento de datos personales</h1>
        <p className="legal-meta">Vigencia: {LEGAL_EFFECTIVE_DATE} · Versión: {DATA_PROCESSING_VERSION}</p>
        <p className="notice">
          Este contrato se incorpora a los Términos de servicio. Completa los
          datos entre corchetes y valida el texto con asesoría jurídica antes
          de utilizarlo como contrato definitivo.
        </p>

        <h2>1. Partes y roles</h2>
        <p>
          La empresa cliente que acepta los <Link to="/terminos">Términos de
          servicio</Link> (el "Responsable") determina las finalidades y medios
          esenciales de los datos personales que ingresa a MULTIFACTU. [Razón
          social del proveedor], RUC [RUC del proveedor], con domicilio en
          Vergeles Mz. 235, Solar 6-5, Guayaquil, Ecuador (el "Encargado"),
          trata dichos datos exclusivamente por cuenta del Responsable para
          prestar la plataforma. Este contrato no aplica a los datos para los
          que MULTIFACTU actúa como responsable, descritos en la <Link to="/privacidad">Política
          de privacidad</Link>.
        </p>

        <h2>2. Objeto, duración y finalidad</h2>
        <p>
          El encargo comprende el alojamiento, consulta, organización,
          mantenimiento, soporte y, cuando sea configurado por el Responsable,
          procesamiento de operaciones de ventas, facturación, inventario,
          alquileres, finanzas y reportes, así como del asistente RUFO
          (consultas, cifras agregadas, memoria y hallazgos confirmados por el
          Responsable), dentro de MULTIFACTU. Rige durante la
          relación de servicio y hasta completar la devolución o eliminación
          acordada, sin perjuicio de las obligaciones legales de conservación.
        </p>

        <h2>3. Categorías de datos y titulares</h2>
        <p>
          Los datos pueden incluir identificadores, contacto, datos fiscales,
          información comercial, transacciones, cuentas por cobrar o pagar y
          documentos asociados. Los titulares pueden ser clientes, prospectos,
          proveedores, representantes, personal autorizado y otros contactos
          incorporados legítimamente por el Responsable. El Responsable no
          cargará categorías especiales ni datos de menores salvo que sea
          necesario, lícito y esté expresamente instruido y documentado.
        </p>

        <h2>4. Instrucciones del Responsable</h2>
        <p>
          El Encargado tratará los datos únicamente conforme a este contrato,
          los Términos, las funcionalidades configuradas por el Responsable y
          sus instrucciones documentadas compatibles con la ley. No los usará
          para fines distintos ni los transferirá, comunicará o conservará para
          terceros salvo autorización escrita del Responsable o mandato legal.
          Si una instrucción infringe la normativa aplicable, el Encargado lo
          comunicará cuando esté legalmente permitido.
        </p>

        <h2>5. Obligaciones del Responsable</h2>
        <p>
          El Responsable garantiza que cuenta con una base jurídica para
          recopilar y comunicar los datos, que ha informado a los titulares
          cuando corresponde, que atiende sus derechos y que mantiene exactos
          los datos introducidos. También define perfiles, usuarios autorizados,
          plazos de conservación e instrucciones de devolución o eliminación.
        </p>

        <h2>6. Seguridad y confidencialidad</h2>
        <p>
          El Encargado aplicará medidas técnicas, administrativas,
          organizativas y jurídicas apropiadas al riesgo, mantendrá la
          confidencialidad de las personas autorizadas y limitará el acceso a lo
          necesario para el servicio. Las medidas incluyen autenticación con
          contraseñas mínimas, roles ADMIN/CAJERO, aislamiento por empresa
          (Row Level Security) aplicado también a la memoria y los hallazgos
          del asistente, validación centralizada de origen, sesión, rol y
          secretos en cada función del servidor, límites de intentos, cifrado
          en tránsito (TLS), archivos privados, cifrado de la contraseña .p12
          con Supabase Vault y auditoría automática de dependencias en cada
          actualización. El Responsable reconoce que debe administrar de forma
          segura sus propias credenciales y permisos.
        </p>

        <h2>7. Subencargados y transferencias</h2>
        <p>
          El Responsable autoriza el uso de los siguientes subencargados,
          necesarios para la infraestructura y operación, siempre sujetos a
          obligaciones equivalentes de protección:
        </p>
        <ul>
          <li><b>Supabase Inc.</b> (EE.UU.): autenticación, base de datos PostgreSQL, almacenamiento y funciones de servidor.</li>
          <li><b>Vercel Inc.</b> (EE.UU.): alojamiento de la aplicación web.</li>
          <li><b>NVIDIA Corp.</b> (NIM, EE.UU.): procesamiento puntual de las preguntas del asistente RUFO con el contexto necesario (cifras agregadas y memoria del asistente) para generar respuestas, sin usar los datos para entrenar modelos.</li>
          <li><b>PayPhone</b> (Ecuador): procesamiento de pagos de los planes contratados.</li>
        </ul>
        <p>
          MULTIFACTU comunicará cambios materiales de esta lista con antelación
          razonable. Las transferencias internacionales se realizarán con las
          garantías exigidas por la normativa aplicable. La contraseña del
          certificado de firma electrónica se trata únicamente cifrada
          (Supabase Vault) y nunca en texto plano.
        </p>

        <h2>8. Incidentes y derechos de los titulares</h2>
        <p>
          El Encargado notificará al Responsable sin dilación indebida cuando
          tenga conocimiento de una vulneración de seguridad que afecte los
          datos objeto del encargo, aportando la información disponible para que
          el Responsable evalúe sus obligaciones. El Encargado prestará
          asistencia razonable para atender solicitudes de derechos, evaluaciones
          de riesgo y requerimientos de la autoridad, teniendo en cuenta la
          naturaleza del tratamiento y la información disponible.
        </p>

        <h2>9. Auditoría y evidencia</h2>
        <p>
          El Responsable podrá solicitar información razonable para verificar
          el cumplimiento de este contrato. Las auditorías deberán acordarse
          previamente, proteger la confidencialidad y no comprometer la
          seguridad, disponibilidad ni información de otros clientes. La
          aceptación electrónica del administrador del Cliente se registra con
          fecha y versión como evidencia contractual.
        </p>

        <h2>10. Devolución o eliminación</h2>
        <p>
          Al finalizar el servicio, el Encargado devolverá o eliminará los
          datos según instrucción documentada del Responsable, dentro de las
          capacidades operativas del servicio y salvo conservación obligatoria
          por ley. Las copias de respaldo se eliminarán conforme a sus ciclos
          técnicos. Antes de la puesta en producción, MULTIFACTU deberá publicar
          el procedimiento, canal y plazos de solicitud de exportación,
          devolución y eliminación.
        </p>

        <h2>11. Prevalencia y contacto</h2>
        <p>
          Ante conflicto, este contrato prevalece para el tratamiento de datos
          personales realizado por cuenta del Responsable. Las partes aplicarán
          la Ley Orgánica de Protección de Datos Personales del Ecuador y su
          normativa aplicable. Contacto para este contrato: <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
