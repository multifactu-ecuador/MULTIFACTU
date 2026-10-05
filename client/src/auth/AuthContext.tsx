import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/react";
import { check, configured, db, setSupabaseTokenGetter } from "../lib/supabase";
import type { Access, Feature } from "../lib/types";

/**
 * Sesión sintética de la app. La autenticación la gestiona Clerk: `id` es el
 * `sub` del JWT de Clerk (texto `user_…`), que es el identificador de usuario
 * en la base de datos. Se mantiene la forma `{ user: { id, email } }` para no
 * romper las páginas que consumen `session`.
 */
export interface SessionApp {
  user: { id: string; email: string };
}

interface AuthValue {
  session: SessionApp | null;
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
  const { isLoaded: clerkLoaded, userId, getToken, signOut } = useClerkAuth();
  const { user } = useUser();
  const [access, setAccess] = useState<Access | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [needsOnboarding, setNeedsOnboarding] = useState(false),
    [clock, setClock] = useState({ now: Date.now(), offset: 0 });

  // Referencia "siempre fresca" a getToken: el puente de token vive en un
  // effecto de montaje (deps []) y debe invocar la última versión del hook.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // ── Puente de token ─────────────────────────────────────────────────────
  // supabase-js llama a este getter en cada petición. La integración nativa
  // de Supabase con Clerk crea la plantilla JWT `supabase`; si no existe
  // (o falla), se usa el JWT de sesión normal de Clerk.
  // Este effecto se declara ANTES del effecto de carga de `mi_acceso` para
  // que el getter esté registrado cuando llegue la primera llamada a db().
  useEffect(() => {
    setSupabaseTokenGetter(async () => {
      try {
        return await getTokenRef.current({ template: "supabase" });
      } catch {
        try {
          return await getTokenRef.current();
        } catch {
          return null;
        }
      }
    });
    return () => setSupabaseTokenGetter(null);
  }, []);

  // ── Sesión sintética derivada de Clerk ──────────────────────────────────
  const session: SessionApp | null =
    clerkLoaded && userId
      ? {
          user: {
            id: userId,
            email:
              user?.primaryEmailAddress?.emailAddress ??
              user?.emailAddresses?.[0]?.emailAddress ??
              "",
          },
        }
      : null;

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

  // ── Carga de perfil/empresa (mi_acceso) en bucle de 15 s ───────────────
  // needsOnboarding = hay sesión pero mi_acceso no devuelve perfil/empresa.
  useEffect(() => {
    if (!clerkLoaded) return;
    let live = true;
    setAccess(null);
    setError("");
    setNeedsOnboarding(false);
    if (!configured || !session) {
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
    // El id de Clerk sustituye al id de Supabase Auth en la dependencia.
  }, [clerkLoaded, session?.user.id, configured]);

  useEffect(() => {
    const timer = setInterval(
      () => setClock((c) => ({ ...c, now: Date.now() })),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const active =
    !!access &&
    (access.superadmin === true ||
      (["trial", "active"].includes(access.suscripcion.estado) &&
        clock.now + clock.offset >= Date.parse(access.suscripcion.inicio) &&
        clock.now + clock.offset < Date.parse(access.suscripcion.fin)));
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
          // Cierre de sesión en Clerk + limpieza del estado local.
          // Nunca db().auth.signOut(): Supabase Auth ya no participa.
          try {
            await signOut();
          } finally {
            setAccess(null);
            setNeedsOnboarding(false);
            setError("");
          }
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
