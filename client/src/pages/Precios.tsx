import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/react";
import { Check } from "lucide-react";
import {
  initializePaddle,
  type Environments,
  type Paddle,
  type PricePreviewParams,
  type PricePreviewResponse,
} from "@paddle/paddle-js";
import Brand from "../components/Brand";
import { TIERES, type Tier } from "../lib/preciosPaddle";

type Ciclo = "month" | "year";

// ── Configuración: nunca se asume entorno ni token ─────────────────────────
// Si falta algo, la página muestra el error y NO inicializa Paddle (fallar
// ruidosamente antes que ejecutarse contra la cuenta equivocada).
const TOKEN = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
const ENTORNO = import.meta.env.VITE_PADDLE_ENVIRONMENT as string | undefined;

const ERRORES_CONFIG: string[] = [];
if (!ENTORNO) {
  ERRORES_CONFIG.push('Falta VITE_PADDLE_ENVIRONMENT: define "sandbox" o "production".');
} else if (ENTORNO !== "sandbox" && ENTORNO !== "production") {
  ERRORES_CONFIG.push(
    `VITE_PADDLE_ENVIRONMENT inválido («${ENTORNO}»): usa "sandbox" o "production".`,
  );
}
if (!TOKEN) {
  ERRORES_CONFIG.push("Falta VITE_PADDLE_CLIENT_TOKEN (token de cliente de Paddle).");
} else if (ENTORNO === "sandbox" && !TOKEN.startsWith("test_")) {
  ERRORES_CONFIG.push(
    "Entorno sandbox con un token que no empieza por test_: revisa la cuenta a la que pertenece.",
  );
} else if (ENTORNO === "production" && !TOKEN.startsWith("live_")) {
  ERRORES_CONFIG.push(
    "Entorno production con un token que no empieza por live_: revisa la cuenta a la que pertenece.",
  );
}
if (TIERES.some((t) => !t.priceId.month || !t.priceId.year)) {
  ERRORES_CONFIG.push(
    "Faltan priceId en client/src/lib/preciosPaddle.ts — ejecuta scripts/seed-paddle-catalog.ts y pega los IDs pri_….",
  );
}

// Inicialización única de Paddle.js (StrictMode no debe cargar el script dos veces).
let inicializacion: Promise<Paddle | undefined> | null = null;
function iniciarPaddle(): Promise<Paddle | undefined> {
  if (!inicializacion) {
    inicializacion = initializePaddle({
      token: TOKEN as string,
      environment: ENTORNO as Environments,
      eventCallback: (evento) => {
        // Respaldo del successUrl: si el checkout se completa, aterrizar en /welcome.
        if (evento.name === "checkout.completed") {
          window.location.assign("/welcome");
        }
      },
    });
  }
  return inicializacion;
}

export default function Precios() {
  const [paddle, setPaddle] = useState<Paddle | undefined>(undefined);
  /** null = aún sin resolver; undefined = desconocido (Paddle detecta por IP). */
  const [pais, setPais] = useState<string | null | undefined>(null);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [cargandoPrecios, setCargandoPrecios] = useState(true);
  const [ciclo, setCiclo] = useState<Ciclo>("month");
  const [error, setError] = useState<string | null>(null);
  const { user } = useUser();

  // País server-side (cabecera de Vercel). Sin función o sin cabecera →
  // undefined y NO se envía address: Paddle infiere por IP.
  useEffect(() => {
    let vivo = true;
    fetch("/api/precio-pais")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((dato: { country?: string | null }) => {
        if (vivo) setPais(typeof dato.country === "string" && dato.country ? dato.country : undefined);
      })
      .catch(() => {
        if (vivo) setPais(undefined);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Inicializar Paddle.js sólo con configuración válida.
  useEffect(() => {
    if (ERRORES_CONFIG.length > 0) return;
    let vivo = true;
    iniciarPaddle()
      .then((p) => {
        if (!vivo) return;
        if (p) setPaddle(p);
        else setError("Paddle.js no pudo inicializarse (red o token inválido).");
      })
      .catch((e: unknown) => {
        if (vivo) setError(`Paddle.js no pudo inicializarse: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Una sola llamada PricePreview con los 6 priceIds (mensual + anual de los
  // 3 planes): el interruptor sólo lee del mapa ya cargado.
  useEffect(() => {
    if (ERRORES_CONFIG.length > 0 || !paddle || pais === null) return;
    let vivo = true;
    const items = TIERES.flatMap((tier) =>
      [tier.priceId.month, tier.priceId.year].map((priceId) => ({
        priceId,
        quantity: 1,
      })),
    );
    const parametros: PricePreviewParams = {
      items,
      // Sin país conocido NO se envía `address` (nunca un sentinela).
      ...(pais ? { address: { countryCode: pais } } : {}),
    };
    paddle.PricePreview(parametros)
      .then((respuesta: PricePreviewResponse) => {
        if (!vivo) return;
        const mapa: Record<string, string> = {};
        for (const item of respuesta.data.details.lineItems) {
          // Sólo se muestra lo que Paddle devuelve, sin re-formatear.
          mapa[item.price.id] = item.formattedTotals.total;
        }
        setPrecios(mapa);
        setCargandoPrecios(false);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setCargandoPrecios(false);
        setError(`No se pudieron cargar los precios: ${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      vivo = false;
    };
  }, [paddle, pais]);

  function abrirCheckout(tier: Tier) {
    if (!paddle) return;
    const priceId = tier.priceId[ciclo];
    const email = user?.primaryEmailAddress?.emailAddress;
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      // Sólo si hay sesión: prellenar el correo del cliente.
      ...(email ? { customer: { email } } : {}),
      settings: {
        displayMode: "overlay",
        variant: "one-page",
        successUrl: `${window.location.origin}/welcome`,
      },
    });
  }

  const fallos = ERRORES_CONFIG.length > 0 ? ERRORES_CONFIG : null;

  return (
    <div className="marketing">
      <header className="marketing-header">
        <Brand />
        <nav>
          <Link to="/">Inicio</Link>
          <Link to="/facturacion-electronica">Facturación electrónica</Link>
          <Link to="/terminos">Términos</Link>
        </nav>
        <div>
          <Link className="text-link" to="/login">
            Iniciar sesión
          </Link>
          <Link className="button light" to="/registro">
            Crear cuenta gratis ↗
          </Link>
        </div>
      </header>
      <main>
        <section className="marketing-section plans-section">
          <p className="eyebrow">PRECIOS · PAGO CON PADDLE</p>
          <h2>Elige tu plan y empieza con 7 días gratis.</h2>
          <p>
            Precios en la moneda de tu país, calculados por Paddle. Cancela
            cuando quieras.
          </p>

          {fallos && (
            <div className="precios-aviso" role="alert">
              <b>Configuración de Paddle incompleta.</b>
              <ul>
                {fallos.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {error && (
            <div className="precios-aviso" role="alert">
              {error}
            </div>
          )}

          {!fallos && (
            <>
              <div className="ciclo-toggle" role="group" aria-label="Ciclo de facturación">
                <button
                  type="button"
                  className={ciclo === "month" ? "activa" : undefined}
                  aria-pressed={ciclo === "month"}
                  onClick={() => setCiclo("month")}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  className={ciclo === "year" ? "activa" : undefined}
                  aria-pressed={ciclo === "year"}
                  onClick={() => setCiclo("year")}
                >
                  Anual
                  <span>2 meses de regalo</span>
                </button>
              </div>

              <div className="plans-grid">
                {TIERES.map((tier) => {
                  const priceId = tier.priceId[ciclo];
                  const total = precios[priceId];
                  return (
                    <article key={tier.name}>
                      <div>
                        <h3>{tier.name}</h3>
                        {tier.badge && <span className="pill">{tier.badge}</span>}
                      </div>
                      <p>{tier.description}</p>
                      <div className="plan-price">
                        {cargandoPrecios || !total ? "…" : total}
                        <small> / {ciclo === "month" ? "mes" : "año"}</small>
                      </div>
                      <ul>
                        {tier.features.map((i) => (
                          <li key={i}>
                            <Check size={15} />
                            {i}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="button"
                        disabled={!paddle || !total}
                        onClick={() => abrirCheckout(tier)}
                      >
                        Suscribirme a {tier.name} →
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <p className="scope-note">
            El total mostrado es el que devuelve Paddle para tu país (con
            impuestos cuando aplican). Prueba gratuita de 7 días en todos los
            planes; después la suscripción se renueva automáticamente hasta
            que la canceles. Pagos procesados por Paddle.
          </p>
        </section>
      </main>
    </div>
  );
}
