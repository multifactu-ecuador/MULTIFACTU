import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { db } from "../lib/supabase";

interface Msg {
  from: "user" | "ai";
  text: string;
}

const SUGERENCIAS = [
  "¿Cuánto vendí este mes comparado al mes pasado?",
  "¿Cuáles son mis 3 clientes que más me deben?",
  "¿Qué producto se está vendiendo menos?",
  "¿Cómo está mi caja hoy?",
  "¿Tengo cuotas vencidas?",
  "¿Qué productos tienen stock bajo?",
];

const BIENVENIDA =
  "Hola 👋 Soy RUFO, tu asistente. Analizo las facturas, cobros, gastos e inventario de tu empresa y te respondo al instante. Pregúntame en español simple, por ejemplo: «¿cuánto vendí este mes?»";

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([{ from: "ai", text: BIENVENIDA }]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(text: string) {
    const pregunta = text.trim();
    if (!pregunta || busy) return;
    setMessages((m) => [...m, { from: "user", text: pregunta }]);
    setInput("");
    setBusy(true);
    try {
      const { data, error } = await db().functions.invoke("asistente", {
        body: { pregunta },
      });
      let text: string;
      if (error) {
        text = "No pude procesar tu pregunta ahora. Inténtalo de nuevo.";
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) text = body.error;
        } catch {}
      } else {
        text = (data as { respuesta: string }).respuesta;
      }
      setMessages((m) => [...m, { from: "ai", text }]);
    } catch {
      setMessages((m) => [
        ...m,
        { from: "ai", text: "Sin conexión con el asistente. Revisa tu internet." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="assistant">
      <div className="page-heading">
        <div>
          <p className="eyebrow">INTELIGENCIA / ASISTENTE</p>
          <h1>Pregúntale a tu negocio.</h1>
          <p>Respuestas instantáneas con los datos reales de tu empresa.</p>
        </div>
        <span className="pill pill-ia">
          <Sparkles size={13} /> Asistente IA
        </span>
      </div>

      <div className="chat card">
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.from}`}>
              {m.from === "ai" && (
                <span className="chat-avatar">
                  <Sparkles size={14} />
                </span>
              )}
              <p>{m.text}</p>
            </div>
          ))}
          {busy && (
            <div className="chat-msg ai">
              <span className="chat-avatar">
                <Sparkles size={14} />
              </span>
              <p className="chat-typing">Analizando tus datos…</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        {messages.length <= 1 && (
          <div className="chat-suggestions">
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" onClick={() => void ask(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu pregunta… (ej. ¿cuánto vendí este mes?)"
            maxLength={300}
            disabled={busy}
          />
          <button className="btn-ai" type="submit" disabled={busy || !input.trim()}>
            <Send size={16} />
          </button>
        </form>
      </div>
      <small className="muted">
        Las respuestas se calculan al momento con tus facturas autorizadas,
        cuotas, movimientos de caja y catálogo. Sólo el administrador puede
        consultar este módulo.
      </small>
    </section>
  );
}
