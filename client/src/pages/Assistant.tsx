import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, ThumbsUp, ThumbsDown, Check, X, Brain, Plus, Trash2 } from "lucide-react";
import { db } from "../lib/supabase";
import type { RufoAprendizaje, RufoMemoria } from "../lib/types";

interface Msg {
  from: "user" | "ai";
  text: string;
  /** Pregunta que originó la respuesta (para poder valorarla). */
  pregunta?: string;
  valorada?: boolean;
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
  "Hola 👋 Soy RUFO, tu asistente. Analizo las facturas, cobros, gastos e inventario de tu empresa y te respondo al instante. Con el tiempo voy aprendiendo de tu negocio: te propongo hallazgos y tú decides cuáles guardo en mi memoria. Pregúntame en español simple, por ejemplo: «¿cuánto vendí este mes?»";

const TIPO_ETIQUETA: Record<RufoAprendizaje["tipo"], string> = {
  riesgo: "Riesgo",
  oportunidad: "Oportunidad",
  patron: "Patrón",
};

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([{ from: "ai", text: BIENVENIDA }]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [propuestas, setPropuestas] = useState<RufoAprendizaje[]>([]),
    [memoria, setMemoria] = useState<RufoMemoria[]>([]),
    [recuerdo, setRecuerdo] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Hallazgos pendientes de revisión y recuerdos activos de RUFO.
  useEffect(() => {
    void cargar();
  }, []);

  async function cargar() {
    const [p, m] = await Promise.all([
      db().from("rufo_aprendizaje").select("*").eq("estado", "propuesto")
        .order("creado_en", { ascending: false }).limit(6),
      db().from("rufo_memoria").select("*").eq("activo", true)
        .order("creado_en", { ascending: false }).limit(20),
    ]);
    if (!p.error) setPropuestas((p.data ?? []) as RufoAprendizaje[]);
    if (!m.error) setMemoria((m.data ?? []) as RufoMemoria[]);
  }

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
      setMessages((m) => [...m, { from: "ai", text, pregunta }]);
      // El primer análisis puede haber generado hallazgos nuevos.
      void cargar();
    } catch {
      setMessages((m) => [
        ...m,
        { from: "ai", text: "Sin conexión con el asistente. Revisa tu internet." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // 👍/👎: guarda la utilidad de la respuesta; no cambia nada del sistema.
  async function valorar(indice: number, util: boolean) {
    const msg = messages[indice];
    if (!msg || msg.from !== "ai" || msg.valorada || !msg.pregunta) return;
    setMessages((m) => m.map((x, i) => (i === indice ? { ...x, valorada: true } : x)));
    try {
      await db().functions.invoke("asistente", {
        body: { accion: "feedback", pregunta: msg.pregunta, respuesta: msg.text, util },
      });
    } catch {
      /* la valoración es best-effort */
    }
  }

  async function revisar(id: string, decision: "confirmar" | "descartar") {
    try {
      const { error } = await db().functions.invoke("asistente", {
        body: { accion: "revisar", id, decision },
      });
      if (!error) await cargar();
    } catch {
      /* se reintentará en la próxima carga */
    }
  }

  async function olvidar(id: string) {
    try {
      const { error } = await db().functions.invoke("asistente", {
        body: { accion: "olvidar", id },
      });
      if (!error) await cargar();
    } catch {
      /* se reintentará en la próxima carga */
    }
  }

  async function declararRecuerdo(e: React.FormEvent) {
    e.preventDefault();
    const valor = recuerdo.trim();
    if (!valor) return;
    setRecuerdo("");
    try {
      const { error } = await db().functions.invoke("asistente", {
        body: { accion: "perfil", valor },
      });
      if (!error) await cargar();
    } catch {
      /* se reintentará en la próxima carga */
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
              <div>
                <p>{m.text}</p>
                {m.from === "ai" && m.pregunta && (
                  <div className="chat-feedback">
                    {m.valorada ? (
                      <small>¡Gracias! Me sirve para atinar mejor con lo que te propongo.</small>
                    ) : (
                      <>
                        <button type="button" onClick={() => void valorar(i, true)}>
                          <ThumbsUp size={12} /> Me sirvió
                        </button>
                        <button type="button" onClick={() => void valorar(i, false)}>
                          <ThumbsDown size={12} /> Puede mejorar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
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

      {/* Aprendizaje por empresa: RUFO propone, tú decides qué recordar. */}
      <div className="card rufo-panel">
        <p className="eyebrow">RUFO / APRENDIZAJE POR EMPRESA</p>
        <h2>
          <Brain size={18} /> Lo que voy aprendiendo de tu negocio
        </h2>
        <p className="muted">
          Analizo tus datos cada semana y te propongo hallazgos. Tú confirmas o descartas:
          yo nunca decido por ti.
        </p>

        {propuestas.length > 0 ? (
          <ul className="rufo-lista">
            {propuestas.map((p) => (
              <li key={p.id} className={`rufo-item ${p.tipo}`}>
                <div>
                  <b>
                    {TIPO_ETIQUETA[p.tipo]} · {p.titulo}
                  </b>
                  <p>{p.detalle}</p>
                </div>
                <div className="rufo-acciones">
                  <button type="button" className="secondary" onClick={() => void revisar(p.id, "confirmar")}>
                    <Check size={14} /> Confirmar
                  </button>
                  <button type="button" className="secondary" onClick={() => void revisar(p.id, "descartar")}>
                    <X size={14} /> Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rufo-vacio">
            Todavía no tengo hallazgos pendientes. Sigue usando el sistema: cuando algo
            cambie en tus números, te lo propongo aquí.
          </p>
        )}

        <h3 className="rufo-subtitulo">Recuerdos activos</h3>
        {memoria.length > 0 ? (
          <ul className="rufo-recuerdos">
            {memoria.map((m) => (
              <li key={m.id}>
                <span>
                  <b>{m.clave}</b> · {m.valor}
                </span>
                <button
                  type="button"
                  className="rufo-olvidar"
                  onClick={() => void olvidar(m.id)}
                  aria-label="Olvidar"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rufo-vacio">
            Todavía no recuerdo nada confirmado de tu negocio. Confirma un hallazgo o
            cuéntame algo abajo y lo usaré en mis respuestas.
          </p>
        )}

        <form className="rufo-declarar" onSubmit={(e) => void declararRecuerdo(e)}>
          <input
            value={recuerdo}
            onChange={(e) => setRecuerdo(e.target.value)}
            placeholder="Enséñame algo de tu negocio (ej. «Alquilamos grúas y vendemos cemento en Manabí»)"
            maxLength={200}
          />
          <button type="submit" className="secondary" disabled={!recuerdo.trim()}>
            <Plus size={14} /> Añadir recuerdo
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
