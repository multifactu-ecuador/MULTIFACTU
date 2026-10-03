import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { configured } from "../lib/supabase";
export default function ProtectedRoute() {
  const { session, loading, error, needsOnboarding } = useAuth();
  const location = useLocation();
  if (!configured)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  if (loading) return <div className="loading">Cargando tu espacio…</div>;
  if (!session)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  if (error)
    return (
      <div className="loading" role="alert">
        {error}
      </div>
    );
  if (needsOnboarding && location.pathname !== "/onboarding")
    return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
