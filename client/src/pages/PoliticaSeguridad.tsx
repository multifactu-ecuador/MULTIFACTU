import { Link } from "react-router-dom";
import Brand from "../components/Brand";
import { SECURITY_POLICY_VERSION, LEGAL_UPDATED_DATE } from "../lib/legal";

export default function PoliticaSeguridad() {
  return (
    <div className="marketing legal">
      <header>
        <Brand />
        <Link className="button light" to="/registro">Crear cuenta</Link>
      </header>
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Política de seguridad de la información</h1>
        <p className="legal-meta">Vigencia: {LEGAL_UPDATED_DATE} · Versión: {SECURITY_POLICY_VERSION}</p>

        <h2>1. Principios</h2>
        <p>
          Trabajamos con tres principios: confidencialidad (sólo ve los datos
          quien corresponde), integridad (nada se altera por error o por un
          tercero) y disponibilidad (el servicio sigue operando). Se aplica el
          mínimo privilegio: cada rol ve lo mínimo necesario.
        </p>

        <h2>2. Aislamiento de datos por empresa</h2>
        <p>
          Toda la información vive separada por empresa mediante Row Level
          Security (RLS) en la base de datos: ni el navegador ni una llamada
          directa a la API pueden cruzar los datos de una cuenta con otra. El
          aislamiento incluye la memoria y los hallazgos del asistente RUFO.
        </p>

        <h2>3. Acceso e identidad</h2>
        <p>
          Sesión autenticada, contraseñas mínimas de 12 caracteres y roles
          ADMIN/CAJERO aplicados en la base de datos. Las acciones sensibles
          quedan registradas en la bitácora de auditoría —qué, cuándo y por
          quién— sin almacenar secretos en los registros.
        </p>

        <h2>4. Secretos y procesos sensibles</h2>
        <p>
          La contraseña de tu firma .p12 se guarda cifrada con Supabase Vault
          (pgsodium) y jamás existe en texto plano ni llega al navegador. Firma,
          verificación y envío al SRI ocurren en funciones privadas del servidor.
          Cada función valida de forma centralizada origen, sesión, rol y
          secreto antes de responder, con límites de intentos anti fuerza-bruta.
        </p>

        <h2>5. Transporte, archivos y eventos</h2>
        <p>
          Cifrado en tránsito (TLS), almacenamiento de archivos privado y
          webhooks o tareas automáticas que exigen un secreto compartido: nada
          entra al sistema sin validarse y los intentos quedan registrados. La
          web se sirve además con cabeceras de seguridad —X-Content-Type-Options
          y X-Frame-Options— que impiden la interpretación errónea de archivos y
          que la aplicación sea embebida en otros sitios (clickjacking).
        </p>

        <h2>6. Seguridad del ciclo de desarrollo</h2>
        <p>
          Cada actualización pasa pruebas automáticas de base de datos y RLS,
          verificación de tipos y una auditoría de dependencias con alertas y
          fecha límite de revisión; Dependabot monitorea vulnerabilidades y los
          parches se aplican mediante integración continua antes de publicarse.
        </p>

        <h2>7. Inteligencia artificial responsable</h2>
        <p>
          RUFO sólo lee los datos de tu empresa, su memoria la confirmas tú y
          nada se usa para entrenar modelos ni se comparte entre cuentas. RUFO
          propone: no ejecuta acciones ni toma decisiones por ti.
        </p>

        <h2>8. Gestión de incidentes</h2>
        <p>
          Si detectas un incidente o un acceso no autorizado, repórtalo de
          inmediato a <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a>:
          notificaremos al afectado sin dilación indebida con la información
          disponible.
        </p>

        <h2>9. Tu responsabilidad</h2>
        <p>
          Protege tus credenciales, asigna roles sólo a personal autorizado,
          mantén tu certificado vigente y nunca compartas la contraseña de tu
          firma por WhatsApp ni correo.
        </p>

        <p>
          Teléfono: <a href="tel:0987516088">0987516088</a> ·{" "}
          <Link to="/privacidad">Política de privacidad</Link> ·{" "}
          <Link to="/terminos">Términos de servicio</Link>
        </p>
      </main>
    </div>
  );
}
