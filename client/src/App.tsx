import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import PlanGate from "./components/PlanGate";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import POS from "./pages/POS";
import Dashboard from "./pages/Dashboard";
import ScheduledInvoices from "./pages/ScheduledInvoices";
import TemplatesEditor from "./pages/TemplatesEditor";


import Inventory from "./pages/Inventory";
import Customers from "./pages/Customers";
import Finance from "./pages/Finance";
import Documents from "./pages/Documents";
import Plans from "./pages/Plans";
import Profile from "./pages/Profile";
import Account from "./pages/Account";
import Storage from "./pages/Storage";
import Onboarding from "./pages/Onboarding";
import Legal from "./pages/Legal";
import Privacy from "./pages/Privacy";
import DataProcessingAgreement from "./pages/DataProcessingAgreement";
import RentalInfo from "./pages/RentalInfo";
import Security from "./pages/Security";
import Cookies from "./pages/Cookies";
import PoliticaSeguridad from "./pages/PoliticaSeguridad";
import CumplimientoLegal from "./pages/CumplimientoLegal";
import ElectronicInvoicing from "./pages/ElectronicInvoicing";
import BusinessIntelligence from "./pages/BusinessIntelligence";
import Proformas from "./pages/Proformas";
import QuotePublic from "./pages/QuotePublic";
import Assistant from "./pages/Assistant";
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/terminos" element={<Legal />} />
          <Route path="/privacidad" element={<Privacy />} />
          <Route path="/contrato-encargo" element={<DataProcessingAgreement />} />
          <Route path="/alquileres" element={<RentalInfo />} />
          <Route path="/seguridad" element={<Security />} />
          <Route path="/politica-seguridad" element={<PoliticaSeguridad />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/cumplimiento-legal" element={<CumplimientoLegal />} />
          <Route path="/facturacion-electronica" element={<ElectronicInvoicing />} />
          <Route path="/inteligencia-negocios" element={<BusinessIntelligence />} />
          <Route path="/cotizacion/:token" element={<QuotePublic />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/app" element={<AppLayout />}>
              <Route
                index
                element={
                  <PlanGate feature="facturacion">
                    <Dashboard />
                  </PlanGate>
                }
              />
              <Route
                path="venta"
                element={
                  <PlanGate feature="facturacion">
                    <POS />
                  </PlanGate>
                }
              />
              <Route
                path="alquiler"
                element={
                  <PlanGate feature="alquiler">
                    <POS rental />
                  </PlanGate>
                }
              />
              <Route
                path="inventario"
                element={
                  <PlanGate feature="inventario">
                    <Inventory />
                  </PlanGate>
                }
              />
              <Route
                path="clientes"
                element={
                  <PlanGate feature="clientes">
                    <Customers />
                  </PlanGate>
                }
              />
              <Route
                path="comprobantes"
                element={
                  <PlanGate feature="facturacion">
                    <Documents />
                  </PlanGate>
                }
              />
              <Route
                path="finanzas"
                element={
                  <PlanGate feature="finanzas">
                    <Finance />
                  </PlanGate>
                }
              />
              <Route
                path="proformas"
                element={
                  <PlanGate feature="proformas">
                    <Proformas />
                  </PlanGate>
                }
              />
              <Route
                path="asistente"
                element={
                  <PlanGate feature="analisis">
                    <Assistant />
                  </PlanGate>
                }
              />
              <Route
                path="programadas"
                element={
                  <PlanGate feature="programada">
                    <ScheduledInvoices />
                  </PlanGate>
                }
              />
              <Route path="perfil" element={<Profile />} />
              <Route path="cuenta" element={<Account />} />
              <Route path="almacenamiento" element={<Storage />} />
              <Route path="planes" element={<Plans />} />
              <Route path="plantillas" element={<PlanGate feature="configuracion"><TemplatesEditor /></PlanGate>} />
            </Route>
          </Route>
          <Route path="*" element={<Landing />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
