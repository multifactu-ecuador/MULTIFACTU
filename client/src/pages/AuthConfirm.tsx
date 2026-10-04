import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { db, check, configured } from "../lib/supabase";
import Brand from "../components/Brand";

export default function AuthConfirm() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verificando tu correo...");

  useEffect(() => {
    if (!configured) {
      setStatus("error");
      setMessage("Supabase no está configurado.");
      return;
    }

    const code = searchParams.get("code");
    const type = searchParams.get("type");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDescription || error);
      return;
    }

    const confirm = async () => {
      try {
        if (code) {
          const { error } = await db().auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Supabase can return an implicit-flow session in the URL hash rather
          // than a PKCE `code`. The client consumes that hash on initialization.
          const { data, error: sessionError } = await db().auth.getSession();
          if (sessionError) throw sessionError;
          if (!data.session) {
            throw new Error("El enlace es inválido, venció o no contiene una sesión de confirmación.");
          }
        }

        setStatus("success");
        setMessage("Correo confirmado. Preparando tu cuenta...");
        if (type === "signup" || type === "email_change" || !type) {
          navigate("/onboarding");
        } else {
          navigate("/app");
        }
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "No se pudo confirmar el correo");
      }
    };

    void confirm();
  }, [searchParams, navigate]);

  return (
    <div className="auth-page">
      <header>
        <Brand />
      </header>
      <div className="auth-grid">
        <section>
          <p className="eyebrow">CONFIRMACIÓN</p>
          <h1>Confirmando tu correo...</h1>
          <p>Por favor espera mientras verificamos tu enlace.</p>
        </section>
        <section className="auth-card">
          <div className="notice" role="status">
            <h3>{status === "loading" ? "Verificando..." : status === "success" ? "¡Listo!" : "Error"}</h3>
            <p>{message}</p>
            {status === "error" && (
              <div style={{ marginTop: "16px" }}>
                <a href="/registro" className="button secondary">
                  Volver al registro
                </a>
                <a href="/login" className="button secondary" style={{ marginLeft: "8px" }}>
                  Iniciar sesión
                </a>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
