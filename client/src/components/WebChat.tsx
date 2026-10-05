import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Msg {
  from: "user" | "ai";
  text: string;
}

const SUGERENCIAS_PUBLICAS = [
  "¿Cuánto cuesta?",
  "¿Qué incluye la prueba gratis?",
  "¿Cómo apruebo una cotización?",
  "¿Es válido para el SRI?",
];

const SUGERENCIAS_INTERNAS = [
  "¿Cuánto vendí este mes?",
  "¿Quiénes son mis 3 clientes que más me deben?",
  "¿Qué producto se vende menos?",
  "¿Cómo subo mi firma .p12?",
];

const SALUDO_PUBLICO =
  "¡Hola! Soy RUFO ✨, el asistente de MULTIFACTU. Pregúntame lo que quieras: planes, funciones, facturación SRI o cómo empezar.";

const SALUDO_INTERNO =
  "¡Hola! Soy RUFO ✨. Pregúntame por tus ventas, clientes, stock o cómo usar el sistema.";

/** Chat flotante MULTI. mode="public": web de visitantes (asistente-web).
 *  mode="internal": dentro de la app, responde con los datos del negocio
 *  (función asistente, sólo ADMIN). */
export default function WebChat({ mode = "public" }: { mode?: "public" | "internal" }) {
  const interno = mode === "internal";
  const [open, setOpen] = useState(false),
    [messages, setMessages] = useState<Msg[]>([
      { from: "ai", text: interno ? SALUDO_INTERNO : SALUDO_PUBLICO },
    ]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  async function ask(text: string) {
    const pregunta = text.trim();
    if (!pregunta || busy) return;
    setMessages((m) => [...m, { from: "user", text: pregunta }]);
    setInput("");
    setBusy(true);
    try {
      if (!supabase) throw new Error("off");
      const { data, error } = await supabase.functions.invoke(
        interno ? "asistente" : "asistente-web",
        { body: { pregunta } },
      );
      let text: string;
      if (error) {
        text = "Ahora no puedo responder. Inténtalo en un momento, por favor.";
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
        { from: "ai", text: "Sin conexión en este momento. Revisa tu internet e inténtalo de nuevo." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={"webchat-fab" + (open ? " hidden" : "")}
        onClick={() => setOpen(true)}
        aria-label="Abrir chat con la IA de MULTIFACTU"
      >
        <MessageCircle size={22} />
        <span className="webchat-fab-dot" />
      </button>
      {open && (
        <section className="webchat" aria-label="Chat con la IA de MULTIFACTU">
          <header>
            <span className="webchat-title">
              <Sparkles size={15} />
              <b>RUFO · Asistente IA</b>
              <small>en línea</small>
            </span>
            <button onClick={() => setOpen(false)} aria-label="Cerrar chat">
              <X size={17} />
            </button>
          </header>
          <div className="webchat-messages">
            {messages.map((m, i) => (
              <p key={i} className={m.from === "user" ? "user" : "ai"}>
                {m.text}
              </p>
            ))}
            {busy && <p className="ai typing">Escribiendo…</p>}
            <div ref={bottomRef} />
          </div>
          {messages.length <= 1 && (
            <div className="webchat-suggestions">
              {(interno ? SUGERENCIAS_INTERNAS : SUGERENCIAS_PUBLICAS).map((s) => (
                <button key={s} type="button" onClick={() => void ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta…"
              maxLength={400}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar">
              <Send size={15} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
