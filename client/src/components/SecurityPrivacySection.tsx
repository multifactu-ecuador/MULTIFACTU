import { Lock, EyeOff, FileCheck2 } from "lucide-react";
import { Link } from "react-router-dom";

/** Hechos verificados en el backend: server/src/fiscal/cryptoUtils.ts (AES-256-GCM)
 *  y supabase/migrations/202610040013_emisor_firmas.sql ("PostgreSQL nunca
 *  recibe el P12 ni la contraseña en texto plano"). */
const TARJETAS = [
  {
    icono: Lock,
    titulo: "Cifrado de grado militar",
    texto:
      "Tu archivo .p12 y tu contraseña se cifran con AES-256-GCM, el estándar que usa la banca. Cada cifrado lleva su propia etiqueta de autenticación: ni un bit puede alterarse sin que se detecte.",
    etiqueta: "AES-256-GCM",
  },
  {
    icono: EyeOff,
    titulo: "Cero almacenamiento vulnerable",
    texto:
      "El certificado se procesa en memoria segura, solo el tiempo exacto de autorizar tu comprobante. Ni la base de datos ni los trabajadores internos reciben tu P12 ni tu contraseña en claro.",
    etiqueta: "Memoria efímera",
  },
  {
    icono: FileCheck2,
    titulo: "Alineación con lineamientos del SRI",
    texto:
      "XML según el esquema oficial v1.1.0, firma XAdES-BES con tu propio certificado y claves de acceso de 49 dígitos. La autorización de cada comprobante la emite el SRI.",
    etiqueta: "Esquema v1.1.0",
  },
];

/** Sección "Seguridad y Privacidad" de la landing. Estilos con Tailwind v4. */
export default function SecurityPrivacySection() {
  return (
    <section className="border-t border-[#29292f] bg-[#0c0c10] px-[max(30px,calc((100vw_-_1248px)/2))] py-[70px]">
      <p className="eyebrow">Seguridad y privacidad</p>
      <h2 className="mt-2 mb-9 max-w-[820px] text-[29px] leading-[1.2] tracking-[-1.2px] sm:text-[34px] sm:tracking-[-1.4px] lg:text-[40px] lg:tracking-[-1.6px]">
        Tus datos y tu firma electrónica, bajo blindaje bancario
      </h2>
      <p className="mb-9 max-w-[680px] text-[15.5px] leading-[1.7] text-[#92929c]">
        La seguridad no es una capa más: es la base sobre la que construimos
        MULTIFACTU. Tratamos cada comprobante, cada clave y cada archivo de tu
        negocio como si fuera de un banco —{" "}
        <Link
          className="font-bold text-[#cdff28] no-underline hover:underline"
          to="/seguridad"
        >
          mira los 12 controles que aplicamos
        </Link>
        .
      </p>
      <div className="mb-7 grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {TARJETAS.map(({ icono: Icono, titulo, texto, etiqueta }) => (
          <article
            key={titulo}
            className="rounded-[14px] border border-[#232329] bg-[#111114] p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-[#cdff28]/50 hover:bg-[#141419]"
          >
            <span className="mb-5 inline-flex rounded-xl border border-[#cdff28]/25 bg-[#cdff28]/10 p-3 text-[#cdff28]">
              <Icono size={24} aria-hidden />
            </span>
            <h3 className="mb-2 text-[16px] font-semibold tracking-[-0.4px] text-[#f0f0f2]">
              {titulo}
            </h3>
            <p className="text-[13px] leading-[1.6] text-[#92929c]">{texto}</p>
            <span className="mt-4 inline-block rounded-full border border-[#29292f] bg-[#0c0c0e] px-3 py-1 text-[11px] font-medium text-[#c6c6cd]">
              {etiqueta}
            </span>
          </article>
        ))}
      </div>
      <p className="scope-note">
        MULTIFACTU no vende firmas electrónicas ni declara respaldo oficial
        del SRI. La firma XAdES-BES se genera con tu propio certificado
        (.p12) y la autorización de cada comprobante depende del SRI.
      </p>
    </section>
  );
}
