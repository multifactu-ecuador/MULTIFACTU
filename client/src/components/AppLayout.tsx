import { NavLink, Outlet, Link } from "react-router-dom";
import {
  Package,
  ReceiptText,
  CalendarDays,
  ChartNoAxesCombined,
  Users,
  Settings,
  LockKeyhole,
  LogOut,
  CalendarClock,
  FileText,
  FileCheck2,
  Layout,
  Palette,
  Sparkles,
  UserRound,
  HardDrive,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { sriRealListo } from "../lib/supabase";
import Brand from "./Brand";
import WebChat from "./WebChat";
import type { Feature } from "../lib/types";
const routes: Array<{
  url: string;
  name: string;
  icon: typeof Package;
  feature?: Feature;
}> = [
  {
    url: "/app",
    name: "Inicio / Panel",
    icon: ChartNoAxesCombined,
    feature: "facturacion",
  },
  {
    url: "/app/venta",
    name: "Punto de venta",
    icon: ReceiptText,
    feature: "facturacion",
  },
  {
    url: "/app/alquiler",
    name: "Punto de alquiler",
    icon: CalendarDays,
    feature: "alquiler",
  },
  {
    url: "/app/inventario",
    name: "Inventario y productos",
    icon: Package,
    feature: "inventario",
  },
  { url: "/app/clientes", name: "Clientes", icon: Users, feature: "clientes" },
  {
    url: "/app/proformas",
    name: "Proformas",
    icon: FileCheck2,
    feature: "proformas",
  },
  {
    url: "/app/comprobantes",
    name: "Comprobantes",
    icon: ReceiptText,
    feature: "facturacion",
  },
  {
    url: "/app/finanzas",
    name: "Finanzas y caja",
    icon: ChartNoAxesCombined,
    feature: "finanzas",
  },
  {
    url: "/app/plantillas",
    name: "Plantillas docs",
    icon: Palette,
    feature: "configuracion",
  },
  {
    url: "/app/programadas",
    name: "Facturas programadas",
    icon: CalendarClock,
    feature: "programada",
  },
  {
    url: "/app/asistente",
    name: "Asistente IA",
    icon: Sparkles,
    feature: "analisis",
  },
  { url: "/app/perfil", name: "Mi empresa", icon: Settings },
  { url: "/app/cuenta", name: "Mi cuenta", icon: UserRound },
  { url: "/app/almacenamiento", name: "Almacenamiento", icon: HardDrive },
  { url: "/app/planes", name: "Plan y suscripción", icon: Settings },
];
export default function AppLayout() {
  const { access, allowed, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="app-brand">
          <Brand dark icon to={null} />
          <b>
            MULTIFACTU<small>CONTROL EMPRESARIAL</small>
          </b>
        </div>
        <Link
          className="business-tile"
          to="/app/perfil"
          title="Ir a Mi empresa"
        >
          <span>{access?.empresa.nombre[0]}</span>
          <div>
            <b>{access?.empresa.nombre}</b>
            <small>{access?.empresa.ruc ?? "RUC por configurar"}</small>
          </div>
        </Link>
        <p className="eyebrow">TU ESPACIO DE TRABAJO</p>
        <nav>
          {routes.map((r) => (
            <NavLink key={r.url} to={r.url} end={r.url === "/app"}>
              <r.icon size={18} />
              {r.name}
              {r.feature && !allowed(r.feature) && (
                <LockKeyhole className="nav-lock" size={13} />
              )}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>
            {access?.nombre} · {access?.rol}
          </span>
          <button onClick={() => void logout()}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <span>
            Operaciones / <b>Tu empresa</b>
          </span>
          {access && sriRealListo(access.empresa) ? (
            <span className="pill pill-real">FACTURACIÓN REAL</span>
          ) : (
            <span className="pill">SRI simulado · sin validez tributaria</span>
          )}
        </header>
        <div
          className={
            "subscription-bar " + (!allowed("facturacion") ? "expired" : "")
          }
        >
          <div>
            <b>
              {access?.superadmin
                ? "Acceso total · Propietario"
                : !allowed("facturacion")
                  ? "Acceso vencido"
                  : access?.suscripcion.estado === "trial"
                    ? "Prueba gratuita · Luxury"
                    : `Plan ${access?.suscripcion.plan}`}
            </b>
            <small>
              {access?.superadmin
                ? "Todas las funciones habilitadas"
                : `Hasta ${
                    access
                      ? new Date(access.suscripcion.fin).toLocaleString(
                          "es-EC",
                          { timeZone: "America/Guayaquil" },
                        )
                      : ""
                  } · sin cobro automático`}
              {access?.suscripcion.estado === "trial" &&
                !access?.superadmin &&
                ` · Facturas de prueba: ${access.facturas_prueba ?? 0}/10`}
            </small>
          </div>
          <Link to="/app/planes">Ver planes / renovar →</Link>
        </div>
        <main>
          <Outlet />
        </main>
      </section>
      {access?.rol === "ADMIN" && <WebChat mode="internal" />}
    </div>
  );
}
