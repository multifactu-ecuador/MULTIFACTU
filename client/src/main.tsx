import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* signInUrl/signUpUrl globales: TODO enlace interno de Clerk (modales de
        la Landing, "Sign in"/"Sign up" dentro de los formularios, botones en
        modo redirect) usa NUESTRAS rutas. Sin esto, esas rutas caen en las
        páginas alojadas de Clerk (accounts.dev, con marca "Development
        mode"). React Router y el routing="hash" de los componentes siguen
        mandando dentro de la app. */}
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
      signInUrl="/login"
      signUpUrl="/registro"
    >
      <App />
      {/* Web Analytics de Vercel: sin cookies ni datos personales, sólo
          métricas de páginas (mismo origen, permitido por la CSP). */}
      <Analytics />
    </ClerkProvider>
  </StrictMode>,
);
