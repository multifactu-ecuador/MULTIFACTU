import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HardDrive, RefreshCw } from "lucide-react";
import { db, today } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import {
  LIMITE_ALMACENAMIENTO_MB,
  COMPROBANTES_MES,
  LIMITE_FACTURAS_PRUEBA,
  PROMEDIO_KB,
  formatoMB,
  mb,
} from "../lib/limits";

type BucketInfo = { bucket: string; nombre: string; bytes: number };
const BUCKETS: Array<{ bucket: string; nombre: string }> = [
  { bucket: "documentos", nombre: "Documentos fiscales (XML/PDF)" },
  { bucket: "logos", nombre: "Logos e imágenes" },
  { bucket: "certificados", nombre: "Certificados .p12" },
  { bucket: "avatares", nombre: "Fotos de perfil" },
];

/** Suma los bytes de un bucket bajo el prefijo de la empresa (recorriendo
 *  subcarpetas). Si RLS no permite verlo, devuelve 0. */
async function pesoBucket(bucket: string, tenant: string): Promise<number> {
  const listar = async (prefix: string): Promise<number> => {
    const r = await db().storage.from(bucket).list(prefix, { limit: 1000 });
    if (r.error || !r.data) return 0;
    let total = 0;
    for (const item of r.data as Array<{
      name: string;
      id?: string | null;
      metadata?: { size?: number } | null;
    }>) {
      const size = item.metadata?.size;
      if (typeof size === "number") total += size;
      else if (item.id == null && item.metadata == null)
        total += await listar(prefix ? `${prefix}/${item.name}` : item.name);
    }
    return total;
  };
  return listar(tenant);
}

export default function Storage() {
  const { access } = useAuth();
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true),
    [info, setInfo] = useState<{
      buckets: BucketInfo[];
      usado: number;
      limite: number;
      productos: number | null;
      clientes: number | null;
      proveedores: number | null;
      usuarios: number | null;
      comprobantes: number | null;
    } | null>(null);

  const cargar = useCallback(async () => {
    if (!access) return;
    setCargando(true);
    setError("");
    try {
      const tenant = access.tenant_id;
      const buckets: BucketInfo[] = [];
      for (const b of BUCKETS) {
        buckets.push({ ...b, bytes: await pesoBucket(b.bucket, tenant) });
      }
      const usado = buckets.reduce((sum, b) => sum + b.bytes, 0);
      const trial = access.suscripcion.estado === "trial" && !access.superadmin;
      const limite = trial
        ? 256
        : LIMITE_ALMACENAMIENTO_MB[access.suscripcion.plan];
      const contar = async (
        tabla: string,
        gte?: { campo: string; valor: string },
      ): Promise<number | null> => {
        try {
          let q = (db().from(tabla) as any).select("id", { count: "exact", head: true });
          if (gte) q = q.gte(gte.campo, gte.valor);
          const r = await q;
          return r.error ? null : (r.count ?? 0);
        } catch {
          return null;
        }
      };
      const mes = today().slice(0, 7) + "-01";
      const [productos, clientes, proveedores, usuarios, comprobantes] =
        await Promise.all([
          contar("catalogo_maquinaria"),
          contar("clientes"),
          contar("proveedores"),
          contar("usuarios_perfiles"),
          contar("facturas_sri", { campo: "fecha", valor: mes }),
        ]);
      setInfo({
        buckets,
        usado,
        limite: limite * 1048576,
        productos,
        clientes,
        proveedores,
        usuarios,
        comprobantes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo medir el espacio");
    } finally {
      setCargando(false);
    }
  }, [access]);

  useEffect(() => void cargar(), [cargar]);

  if (!access) return null;
  const trial = access.suscripcion.estado === "trial" && !access.superadmin;
  const plan = access.suscripcion.plan;
  const usado = info?.usado ?? 0;
  const limite = info?.limite ?? 256 * 1048576;
  const libre = Math.max(limite - usado, 0);
  const pct = limite ? Math.min(100, (usado / limite) * 100) : 0;
  const libreKB = libre / 1024;
  const limiteMes = trial
    ? LIMITE_FACTURAS_PRUEBA
    : COMPROBANTES_MES[plan];
  const limiteMuestra =
    (access.superadmin ? null : limiteMes) ?? null;

  const filas: Array<{
    nombre: string;
    usado: number | null;
    limite: number | null;
    texto?: string;
  }> = [
    {
      nombre: trial ? "Facturas de prueba" : "Comprobantes este mes",
      usado: trial ? (access.facturas_prueba ?? 0) : (info?.comprobantes ?? null),
      limite: access.superadmin ? null : limiteMes,
    },
    { nombre: "Productos", usado: info?.productos ?? null, limite: null },
    { nombre: "Clientes", usado: info?.clientes ?? null, limite: null },
    { nombre: "Proveedores", usado: info?.proveedores ?? null, limite: null },
    { nombre: "Usuarios del equipo", usado: info?.usuarios ?? null, limite: null },
    {
      nombre: "Almacenamiento",
      usado: Math.round(mb(usado) * 10) / 10,
      limite: Math.round(mb(limite) * 10) / 10,
      texto: `${formatoMB(usado)} de ${formatoMB(limite)}`,
    },
  ];

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ALMACENAMIENTO / TU ESPACIO</p>
          <h1>Archivos e imágenes.</h1>
          <p>
            Espacio usado por los buckets privados de tu empresa y límites de
            tu plan.
          </p>
        </div>
        <button className="secondary" onClick={() => void cargar()} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? "Calculando…" : "Actualizar"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className="storage-top">
          <div className="gauge" role="img" aria-label={`${pct.toFixed(1)}% de espacio usado`}>
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className="gauge-bg" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="gauge-fg"
                style={{
                  strokeDasharray: `${2 * Math.PI * 52}`,
                  strokeDashoffset: `${2 * Math.PI * 52 * (1 - pct / 100)}`,
                }}
              />
            </svg>
            <b>{pct.toFixed(1)}%</b>
            <span className="pill pill-real">{pct < 90 ? "OK" : "ALTO"}</span>
          </div>
          <div className="storage-mid">
            <h3>Espacio usado</h3>
            <div className="storage-bar">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="storage-labels">
              <span>{formatoMB(libre)} libres</span>
              <span>{formatoMB(usado)} usados</span>
              <span>{formatoMB(limite)} límite</span>
            </div>
            <p className="notice">
              {trial
                ? "Periodo de prueba: tu cuota se amplía al contratar un plan."
                : `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} · cuota informativa de ${formatoMB(limite)}.`}
            </p>
          </div>
          <div className="storage-free">
            <p className="eyebrow">ESPACIO LIBRE PARA…</p>
            <ul>
              <li>
                <b>{Math.floor(libreKB / PROMEDIO_KB.foto)}</b> fotos (~500 KB)
              </li>
              <li>
                <b>{Math.floor(libreKB / PROMEDIO_KB.comprobante)}</b>{" "}
                comprobantes (~300 KB)
              </li>
              <li>
                <b>{Math.floor(libreKB / PROMEDIO_KB.pdf)}</b> facturas PDF
                (~80 KB)
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>
          <HardDrive size={16} /> Distribución por tipo
        </h2>
        {cargando ? (
          <p className="notice">Calculando archivos…</p>
        ) : (info?.buckets.every((b) => b.bytes === 0) ?? true) ? (
          <p className="empty">Sin archivos subidos aún.</p>
        ) : (
          <ul className="dist-list">
            {info!.buckets
              .filter((b) => b.bytes > 0)
              .sort((a, b) => b.bytes - a.bytes)
              .map((b) => (
                <li key={b.bucket}>
                  <span className="dist-name">{b.nombre}</span>
                  <span className="dist-bar">
                    <span
                      style={{
                        width: `${usado ? (b.bytes / usado) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="dist-size">{formatoMB(b.bytes)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="limits-head">
          <h2>Límites del plan</h2>
          <Link to="/app/planes">Ver plan →</Link>
        </div>
        <ul className="limits-list">
          {filas.map((f) => (
            <li key={f.nombre}>
              <span>{f.nombre}</span>
              <span className="dist-bar">
                {f.limite != null && f.usado != null && (
                  <span
                    style={{
                      width: `${Math.min(100, (f.usado / f.limite) * 100)}%`,
                    }}
                  />
                )}
              </span>
              <span className="limit-value">
                {f.usado == null ? "—" : f.usado} /{" "}
                {f.limite == null && !f.texto ? "∞" : (f.limite ?? "∞")}
                {f.texto ? ` · ${f.texto}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <small>
          Los límites de filas marcadas con ∞ no están restringidos; la cuota
          impuesta en el servidor es la de facturas del periodo de prueba (10).
        </small>
        {limiteMuestra === null && trial && (
          <small> Los comprobantes del plan se amplían al contratar.</small>
        )}
      </section>
    </section>
  );
}
