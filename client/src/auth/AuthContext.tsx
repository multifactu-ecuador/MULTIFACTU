import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, db, check } from "../lib/supabase";
import type { Access, Feature } from "../lib/types";
interface AuthValue {
  session: Session | null;
  access: Access | null;
  loading: boolean;
  error: string;
  /** Usuario autenticado (p. ej. Google) sin empresa creada: debe completar /onboarding. */
  needsOnboarding: boolean;
  allowed: (feature: Feature) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [access, setAccess] = useState<Access | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [needsOnboarding, setNeedsOnboarding] = useState(false),
    [clock, setClock] = useState({ now: Date.now(), offset: 0 });
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let live = true;
    let eventSeen = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      eventSeen = true;
      if (live) setSession(next);
    });
    void supabase.auth.getSession().then((r) => {
      if (!live) return;
      if (r.error) setError(r.error.message);
      if (!eventSeen) setSession(r.data.session);
      if (!r.data.session) setLoading(false);
    });
    return () => {
      live = false;
      subscription.unsubscribe();
    };
  }, []);
  async function refresh() {
    if (!session) return;
    const value = check(await db().rpc("mi_acceso"));
    if (!value) {
      setAccess(null);
      setNeedsOnboarding(true);
      return;
    }
    setAccess(value);
    setNeedsOnboarding(false);
    setClock({ now: Date.now(), offset: Date.parse(value.ahora) - Date.now() });
  }
  useEffect(() => {
    let live = true;
    setAccess(null);
    setError("");
    setNeedsOnboarding(false);
    if (!session) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = async () => {
      try {
        const value = check(await db().rpc("mi_acceso"));
        if (live) {
          if (!value) {
            setAccess(null);
            setNeedsOnboarding(true);
          } else {
            setAccess(value);
            setNeedsOnboarding(false);
            setClock({
              now: Date.now(),
              offset: Date.parse(value.ahora) - Date.now(),
            });
          }
          setError("");
        }
      } catch (e) {
        if (live)
          setError(
            e instanceof Error ? e.message : "No se pudo cargar tu empresa",
          );
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [session?.user.id]);
  useEffect(() => {
    const timer = setInterval(
      () => setClock((c) => ({ ...c, now: Date.now() })),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const active =
    !!access &&
    ["trial", "active"].includes(access.suscripcion.estado) &&
    clock.now + clock.offset >= Date.parse(access.suscripcion.inicio) &&
    clock.now + clock.offset < Date.parse(access.suscripcion.fin);
  const allowed = (feature: Feature) =>
    active &&
    !!access?.funciones[feature] &&
    !(
      access?.rol === "CAJERO" &&
      ["finanzas", "analisis", "programada"].includes(feature)
    );
  return (
    <AuthContext.Provider
      value={{
        session,
        access,
        loading,
        error,
        needsOnboarding,
        allowed,
        refresh,
        logout: async () => {
          check(await db().auth.signOut());
          setSession(null);
          setAccess(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw Error("AuthProvider requerido");
  return context;
}
