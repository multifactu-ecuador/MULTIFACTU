import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { Feature } from "../lib/types";
export default function PlanGate({
  feature,
  children,
}: {
  feature: Feature;
  children: ReactNode;
}) {
  const { allowed, access } = useAuth();
  if (allowed(feature)) return children;
  const active = allowed("facturacion");
  const role =
    active &&
    access?.rol === "CAJERO" &&
    ["finanzas", "analisis", "programada"].includes(feature);
  const plan = ["finanzas", "analisis", "programada"].includes(feature)
    ? "luxury"
    : feature === "alquiler"
      ? "pro"
      : "inicial";
  return (
    <section className="plan-gate">
      <div>
        <LockKeyhole size={30} />
      </div>
      <p className="eyebrow">PERMISOS DE TU CUENTA</p>
      <h1>
        {role
          ? "Acceso de administrador"
          : active
            ? "Haz más con tu negocio"
            : "Tu prueba o suscripción ha vencido"}
      </h1>
      <p>
        {role
          ? "El administrador puede acceder a este módulo según el plan de la empresa."
          : active
            ? `Esta función está disponible desde el plan ${plan}. Compra ese plan para habilitarla.`
            : "Al finalizar los siete días se bloquean las funciones. Tus datos se conservan; puedes elegir un plan para continuar."}
      </p>
      {!role && (
        <Link className="button" to={"/app/planes?plan=" + plan}>
          Comprar plan {active ? plan : "Inicial"} →
        </Link>
      )}
      <small>
        Los permisos se verifican también en PostgreSQL, aunque cambies el
        navegador.
      </small>
    </section>
  );
}
