import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, XCircle, FileText } from "lucide-react";
import { supabase, money } from "../lib/supabase";
import Brand from "../components/Brand";

interface QuoteItem {
  nombre: string;
  cantidad: number;
  precio: number;
  descuento: number;
  iva: number;
  base: number;
  impuesto: number;
}

interface Quote {
  numero: number;
  estado: "Enviada" | "Aprobada" | "Rechazada" | "Anulada";
  valida_hasta: string;
  creado_en: string;
  metodo_pago: string;
  credito_dias: number;
  empresa: { nombre: string; razon_social: string; ruc: string | null; direccion: string };
  cliente: { nombre: string; identificacion: string };
  items: QuoteItem[];
  subtotal_0: number;
  subtotal_5: number;
  subtotal_15: number;
  descuentos: number;
  iva_5: number;
  iva_15: number;
  total: number;
}

const METODOS: Record<string, string> = {
  "01": "Efectivo",
  "16": "Tarjeta de débito",
  "18": "Tarjeta prepago",
  "19": "Tarjeta de crédito",
  "20": "Transferencia",
};

/** Página pública (sin login): el cliente revisa la cotización y la aprueba
 *  o rechaza desde su teléfono. Aprobar genera la factura automáticamente. */
export default function QuotePublic() {
  const { token } = useParams<{ token: string }>();
  const [quote, setQuote] = useState<Quote | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<"Aprobada" | "Rechazada" | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!supabase || !token) {
        setError("Enlace inválido.");
        setLoading(false);
        return;
      }
      const { data, error: rpcError } = await supabase.rpc("ver_proforma", {
        p_token: token,
      });
      if (!live) return;
      if (rpcError || !data) setError("Cotización no encontrada o enlace inválido.");
      else setQuote(data as Quote);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [token]);

  async function respond(action: "aprobar_proforma" | "rechazar_proforma") {
    if (!supabase || !token || busy) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(action, {
      p_token: token,
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setDone((data as { estado: "Aprobada" | "Rechazada" }).estado);
    }
    setBusy(false);
  }

  return (
    <div className="quote-public">
      <header className="quote-head">
        <Brand />
        <span className="pill pill-ia">
          <FileText size={13} /> Cotización en línea
        </span>
      </header>
      <main className="quote-body">
        {loading && <p className="muted">Cargando cotización…</p>}
        {error && !quote && (
          <div className="quote-card">
            <h1>Enlace no válido</h1>
            <p className="error">{error}</p>
          </div>
        )}
        {quote && !done && (
          <div className="quote-card">
            <p className="eyebrow">COTIZACIÓN #{quote.numero}</p>
            <h1>{quote.empresa.razon_social}</h1>
            <p className="muted">
              {quote.empresa.ruc ? `RUC ${quote.empresa.ruc} · ` : ""}
              {quote.empresa.direccion}
            </p>
            <hr />
            <p>
              <b>Para:</b> {quote.cliente.nombre} · {quote.cliente.identificacion}
            </p>
            <p>
              <b>Válida hasta:</b> {quote.valida_hasta} · <b>Pago:</b>{" "}
              {METODOS[quote.metodo_pago] ?? quote.metodo_pago}
              {quote.credito_dias > 0 ? ` a ${quote.credito_dias} días` : " de contado"}
            </p>
            <table className="quote-items">
              <thead>
                <tr>
                  <th>Detalle</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((i, idx) => (
                  <tr key={idx}>
                    <td>{i.nombre}</td>
                    <td>{i.cantidad}</td>
                    <td>{money(Number(i.precio))}</td>
                    <td>{money(Number(i.base) + Number(i.impuesto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>
                  {money(
                    Number(quote.subtotal_0) + Number(quote.subtotal_5) + Number(quote.subtotal_15),
                  )}
                </dd>
              </div>
              <div>
                <dt>IVA</dt>
                <dd>{money(Number(quote.iva_5) + Number(quote.iva_15))}</dd>
              </div>
              <div className="grand-total">
                <dt>TOTAL</dt>
                <dd>{money(Number(quote.total))}</dd>
              </div>
            </dl>
            {quote.estado === "Enviada" ? (
              <>
                {error && <p className="error">{error}</p>}
                <div className="quote-actions">
                  <button
                    className="btn-ai"
                    disabled={busy}
                    onClick={() => void respond("aprobar_proforma")}
                  >
                    <CheckCircle2 size={17} />
                    {busy ? "Procesando…" : "Aprobar y facturar"}
                  </button>
                  <button
                    className="quote-reject"
                    disabled={busy}
                    onClick={() => void respond("rechazar_proforma")}
                  >
                    <XCircle size={16} /> Rechazar
                  </button>
                </div>
                <small className="muted">
                  Al aprobar, {quote.empresa.nombre} emitirá la factura
                  electrónica correspondiente automáticamente.
                </small>
              </>
            ) : (
              <p className="notice">
                Esta cotización ya fue {quote.estado.toLowerCase()} anteriormente.
              </p>
            )}
          </div>
        )}
        {done === "Aprobada" && (
          <div className="quote-card quote-success">
            <CheckCircle2 size={44} />
            <h1>¡Cotización aprobada!</h1>
            <p>
              Gracias. Tu factura se está generando y pronto recibirás el
              comprobante electrónico de {quote?.empresa.nombre}.
            </p>
          </div>
        )}
        {done === "Rechazada" && (
          <div className="quote-card">
            <XCircle size={44} />
            <h1>Cotización rechazada</h1>
            <p>Hemos notificado a {quote?.empresa.nombre} tu decisión.</p>
          </div>
        )}
      </main>
      <footer className="quote-foot">
        <small>Cotización generada con MULTIFACTU · Facturación para Ecuador</small>
      </footer>
    </div>
  );
}
