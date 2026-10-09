import { Link } from "react-router-dom";
import MarketingFooter from "../components/MarketingFooter";
import MarketingHeader from "../components/MarketingHeader";
import { COOKIES_VERSION, LEGAL_UPDATED_DATE } from "../lib/legal";

export default function Cookies() {
  return (
    <div className="marketing legal">
      <MarketingHeader />
      <main>
        <p className="eyebrow">DOCUMENTO LEGAL</p>
        <h1>Política de cookies</h1>
        <p className="legal-meta">Vigencia: {LEGAL_UPDATED_DATE} · Versión: {COOKIES_VERSION}</p>

        <h2>1. Qué son</h2>
        <p>
          Las cookies son pequeños archivos que un sitio guarda en tu navegador
          para recordar información entre visitas.
        </p>

        <h2>2. Qué utiliza MULTIFACTU</h2>
        <p>MULTIFACTU funciona sin cookies publicitarias ni de rastreo. Sólo usamos lo imprescindible:</p>
        <ul>
          <li>
            <b>Sesión de acceso:</b> tu sesión se guarda en el almacenamiento
            local del navegador (no son cookies) para mantenerte autenticado.
          </li>
          <li>
            <b>Entrega del sitio:</b> el alojamiento (Vercel) puede emplear
            cookies técnicas mínimas e imprescindibles para servir y proteger la
            página.
          </li>
          <li>
            <b>Preferencias legales:</b> tu aceptación de los Términos y de la
            Política de privacidad se guarda en tu cuenta (base de datos) con
            fecha y versión; no en cookies.
          </li>
        </ul>
        <p>
          No usamos cookies de publicidad, ni de perfilamiento, ni analítica de
          terceros.
        </p>

        <h2>3. Cómo controlarlas</h2>
        <p>
          Puedes bloquear o eliminar las cookies desde la configuración de tu
          navegador (Configuración → Privacidad). Si bloqueas todo, podrías
          perder la sesión y volver a iniciarla.
        </p>

        <h2>4. Servicios de terceros</h2>
        <p>
          Trabajamos con subencargados (Supabase, Vercel, Clerk, NVIDIA,
          PayPal) que pueden usar sus propias cookies o almacenamiento
          técnico conforme a sus políticas. La lista actualizada está en la{" "}
          <Link to="/privacidad">Política de privacidad</Link>.
        </p>

        <h2>5. Cambios y contacto</h2>
        <p>
          Actualizaremos esta política si cambian las cookies que utilizamos,
          indicando versión y vigencia. Consultas:{" "}
          <a href="mailto:Mulfactu@gmail.com">Mulfactu@gmail.com</a> ·{" "}
          <a href="tel:0987516088">0987516088</a> ·{" "}
          <Link to="/terminos">Términos de servicio</Link>.
        </p>
      </main>
      <MarketingFooter />
    </div>
  );
}
