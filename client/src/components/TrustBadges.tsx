import { Zap, Lock, ShieldCheck, Headphones } from "lucide-react";

const SELLOS = [
  { Icono: Zap, texto: "Conexión Directa con el SRI" },
  { Icono: Lock, texto: "Cifrado AES-256 en Tránsito y Reposo" },
  { Icono: ShieldCheck, texto: "Protección de Datos Comerciales" },
  { Icono: Headphones, texto: "Soporte Técnico Especializado" },
];

/** Barra de sellos de confianza bajo el CTA del hero.
 *  Píldoras flotantes con borde sutil; flex-wrap las apila en móvil. */
export default function TrustBadges() {
  return (
    <section
      aria-label="Sellos de confianza"
      className="flex flex-wrap items-center justify-center gap-2.5 px-6 pb-9"
    >
      {SELLOS.map(({ Icono, texto }) => (
        <span
          key={texto}
          className="inline-flex items-center gap-2 rounded-full border border-[#29292f] bg-[#0c0c0e] px-4 py-2 text-[12px] font-medium tracking-[0.2px] text-[#b9b9c4] transition-colors duration-300 hover:border-[#cdff28]/45 hover:text-[#f0f0f2]"
        >
          <Icono size={14} className="text-[#cdff28]" aria-hidden />
          {texto}
        </span>
      ))}
    </section>
  );
}
