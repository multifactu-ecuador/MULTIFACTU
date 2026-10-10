import type { ReactNode } from "react";
import { Lock, type LucideIcon } from "lucide-react";

/** Micro-copy de seguridad (icono + texto pequeño) junto a los campos del .p12.
 *  Verde legible sobre blanco (#557a0e), mismo tono que los iconos de .card. */
export default function SecureHint({
  icono: Icono = Lock,
  children,
}: {
  icono?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <p className="secure-hint">
      <Icono size={14} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
