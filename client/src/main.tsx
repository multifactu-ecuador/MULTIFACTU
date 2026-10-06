import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <App />
      {/* Web Analytics de Vercel: sin cookies ni datos personales, sólo
          métricas de páginas (mismo origen, permitido por la CSP). */}
      <Analytics />
    </ClerkProvider>
  </StrictMode>,
);
