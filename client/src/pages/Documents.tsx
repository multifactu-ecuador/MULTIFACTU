import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import QRCode from "qrcode";
import { db, check, money, sriRealListo } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import type { CreditNote, Invoice } from "../lib/types";

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => htmlEntities[character]);
const dormir = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

export default function Documents() {
  const { access } = useAuth();
  const [rows, setRows] = useState<Invoice[]>([]),
    [error, setError] = useState(""),
    [qrFor, setQrFor] = useState<Invoice | null>(null),
    [notas, setNotas] = useState<CreditNote[]>([]),
    [notaFor, setNotaFor] = useState<Invoice | null>(null),
    [motivo, setMotivo] = useState(""),
    [notaCargando, setNotaCargando] = useState(false),
    [notaResultado, setNotaResultado] = useState<{ ok: boolean; texto: string } | null>(
      null,
    );
  const realListo = sriRealListo(access?.empresa);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (qrFor?.clave_acceso && canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, qrFor.clave_acceso, {
        width: 240,
        margin: 1,
      });
    }
  }, [qrFor]);
  const load = async () => {
    setRows(
      (check(
        await db()
          .from("facturas_sri")
          .select("*,clientes(email,nombre)")
          .order("fecha", { ascending: false }),
      ) ?? []) as Invoice[],
    );
    setNotas(
      (check(
        await db()
          .from("notas_credito")
          .select("id,factura_id,estado,motivo,total,clave_acceso,mensaje,creado_en")
          .order("creado_en", { ascending: false }),
      ) ?? []) as CreditNote[],
    );
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function printRide(id: string) {
    const row = check(
      await db().from("facturas_sri").select("*").eq("id", id).single(),
    );
    if (!row) throw Error("Factura no encontrada");
    const det = check(
      await db()
        .from("factura_detalles")
        .select("*")
        .eq("factura_id", id),
    );
    const invRow = row as any;
    let logoDataUrl = "";
    try {
      const empresa = check(
        await (db() as any)
          .from("empresas")
          .select("logo_path")
          .eq("id", invRow.tenant_id)
          .single(),
      ) as any;
      if (empresa?.logo_path) {
        const { data: blob } = await db()
          .storage.from("logos")
          .download(empresa.logo_path);
        if (blob)
          logoDataUrl = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(blob);
          });
      }
    } catch {
      logoDataUrl = "";
    }
    const emisor = (row as any).emisor_snapshot ?? {};
    const cliente = (row as any).cliente_snapshot ?? {};
    const moneyNum = (v: any) => "$" + Number(v ?? 0).toFixed(2);
    const items = ((det ?? []) as any[])
      .map(
        (d) =>
          `<tr><td>${escapeHtml(d.descripcion)}</td><td>${Number(d.cantidad).toFixed(2)}</td><td>${moneyNum(d.precio)}</td><td>${moneyNum(d.base)}</td><td>${Number(d.iva)}%</td><td>${moneyNum(d.impuesto)}</td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>RIDE ${id.slice(0, 8)}</title><style>
      body{font-family:Arial,sans-serif;margin:28px;color:#222}
      h1{font-size:20px;margin:0 0 6px}
      table{width:100%;border-collapse:collapse;margin-top:14px}
      td,th{border:1px solid #bbb;padding:6px;font-size:12px;text-align:left}
      th{background:#f0f0f0}
      .totals{margin-top:14px;float:right;text-align:right}
      @media print { button{display:none} }
    </style></head><body>
      <h1>${escapeHtml(emisor.razon_social ?? "MULTIFACTU")}</h1>
      ${logoDataUrl ? `<img src="${logoDataUrl}" alt="logo" style="max-height:60px;margin-bottom:8px;display:block" />` : ""}
      <div><b>RUC:</b> ${escapeHtml(emisor.ruc ?? "-")} &nbsp; <b>Ambiente:</b> ${escapeHtml((row as any).ambiente_sri)}</div>
      <div><b>Dirección:</b> ${escapeHtml(emisor.direccion ?? "-")}</div>
      <hr/>
      <div><b>Cliente:</b> ${escapeHtml(cliente.nombre ?? "-")} · ${escapeHtml(cliente.identificacion ?? "-")}</div>
      <div><b>Factura:</b> ${escapeHtml(id.slice(0, 8))} · <b>Fecha:</b> ${escapeHtml(row.fecha)}</div>
      <div><b>Estado:</b> ${escapeHtml(row.estado)}</div>
      <p><b>Clave de acceso:</b> ${escapeHtml((row as any).clave_acceso ?? "(pendiente)")}</p>
      <table><thead><tr><th>Detalle</th><th>Cant.</th><th>Precio</th><th>Base</th><th>IVA</th><th>Impuesto</th></tr></thead><tbody>${items}</tbody></table>
      <div class="totals">
        <b>Total sin IVA:</b> ${moneyNum(Number((row as any).subtotal_0) + Number((row as any).subtotal_5) + Number((row as any).subtotal_15))}<br/>
        <b>IVA:</b> ${moneyNum(Number((row as any).iva_5 ?? 0) + Number((row as any).iva_15 ?? 0))}<br/>
        <b>Total:</b> ${moneyNum(row.total)}
      </div>
      ${(row as any).clave_acceso ? `<div style="text-align:center;margin-top:18px"><p><b>Clave de acceso:</b> ${escapeHtml((row as any).clave_acceso)}</p></div>` : ""}
      <p style="margin-top:40px">Representación impresa del comprobante electrónico (RIDE).${(row as any).simulacion ? " Emisión en fase de validación: sin validez tributaria hasta activar el SRI real." : ""}</p>
      <button id="imprimir-ride">Imprimir</button>
    </body></html>`;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) throw Error("El navegador bloqueó la ventana");
    w.document.write(html);
    w.document.close();
    // Se enlaza desde la página madre: la Content-Security-Policy no permite
    // scripts ni manejadores inline ni en el documento principal ni en el popup.
    w.document.getElementById("imprimir-ride")?.addEventListener("click", () => w.print());
    setTimeout(() => {
      try {
        w.print();
      } catch {
        /* si el navegador exige gesto del usuario, está el botón Imprimir */
      }
    }, 350);
  }
  async function downloadRide(id: string) {
    const {
      data: { session },
    } = await db().auth.getSession();
    if (!session) throw Error("Tu sesión venció. Inicia sesión nuevamente.");

    const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
    const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl || !publishableKey) throw Error("Supabase no está configurado.");

    const response = await fetch(`${baseUrl}/functions/v1/generar-ride`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, tipo: "factura" }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw Error(payload?.error ?? "No se pudo generar el PDF RIDE.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `RIDE-${id.slice(0, 8)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function download(id: string) {
    const row = check(
      await db().from("facturas_sri").select("*").eq("id", id).single(),
    );
    if (!row) throw Error("Factura no encontrada");
    const blob = new Blob(
      [
        row.xml_firmado ??
          row.xml_borrador ??
          "<!-- XML aún no preparado; configura el webhook -->",
      ],
      { type: "application/xml" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "MULTIFACTU-comprobante.xml";
    link.click();
    URL.revokeObjectURL(url);
  }
  function cerrarNota() {
    if (notaCargando) return;
    setNotaFor(null);
    setMotivo("");
    setNotaResultado(null);
  }
  async function emitirNota() {
    if (!notaFor) return;
    const texto = motivo.trim();
    if (!texto) {
      setNotaResultado({
        ok: false,
        texto: "Escribe el motivo de la nota de crédito.",
      });
      return;
    }
    setNotaCargando(true);
    setNotaResultado(null);
    try {
      const id = check(
        await db().rpc("crear_nota_credito", {
          p_factura: notaFor.id,
          p_motivo: texto,
        }),
      );
      if (!id) throw Error("No se creó la nota de crédito.");
      // La emisión corre en segundo plano (webhook): esperamos su resultado.
      let estado = "Pendiente",
        detalle = "";
      for (let intento = 0; intento < 15; intento++) {
        await dormir(2000);
        const nota = check(
          await db()
            .from("notas_credito")
            .select("estado,mensaje,clave_acceso")
            .eq("id", id)
            .maybeSingle(),
        );
        if (!nota) break;
        estado = nota.estado;
        detalle =
          nota.mensaje ??
          (nota.clave_acceso ? `Clave de acceso ${nota.clave_acceso}` : "");
        if (estado === "Autorizada" || estado === "Error") break;
      }
      if (estado === "Autorizada")
        setNotaResultado({
          ok: true,
          texto: "Nota de crédito emitida. " + detalle,
        });
      else if (estado === "Error")
        setNotaResultado({
          ok: false,
          texto: detalle || "El SRI no autorizó la nota de crédito.",
        });
      else
        setNotaResultado({
          ok: true,
          texto:
            "Nota de crédito creada y en cola de emisión; el sistema la terminará automáticamente.",
        });
    } catch (e) {
      setNotaResultado({ ok: false, texto: (e as Error).message });
    } finally {
      setNotaCargando(false);
      await load().catch(() => undefined);
    }
  }
  const ncPorFactura = new Map<string, CreditNote>();
  for (const nota of notas)
    if (!ncPorFactura.has(nota.factura_id))
      ncPorFactura.set(nota.factura_id, nota);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {realListo
              ? "COMPROBANTES / FACTURACIÓN REAL"
              : "COMPROBANTES"}
          </p>
          <h1>Tu operación, ordenada.</h1>
          <p>
            {realListo
              ? "Tu empresa tiene sus documentos completos para emitir en modo real."
              : "Emisión en fase de validación: sin validez tributaria hasta activar el SRI real."}
          </p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      {!realListo && (
        <div className="card emision-block" role="alert">
          <p className="eyebrow">FACTURACIÓN ELECTRÓNICA</p>
          <div className="emision-alert">
            <span className="emision-warn">⚠</span>
            <div>
              <h3>
                Su cuenta no está habilitada para la emisión de Documentos
                Electrónicos
              </h3>
              <p>
                Para poder sincronizar sus documentos electrónicos es necesario
                que conecte su cuenta al SRI: carga tu firma electrónica
                (.p12), su contraseña y completa los datos de tu empresa.
              </p>
            </div>
          </div>
          <Link className="emision-cta" to="/app/perfil">
            <LockKeyhole size={14} />
            Habilitar Cuenta
          </Link>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Referencia</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Resultado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nc = ncPorFactura.get(r.id);
              const ncActiva =
                !!nc &&
                (nc.estado === "Pendiente" ||
                  nc.estado === "Procesando" ||
                  nc.estado === "Autorizada");
              return (
              <tr key={r.id}>
                <td>{r.fecha}</td>
                <td>
                  {r.id.slice(0, 8)}
                  {nc && (
                    <span
                      className={
                        "pill pill-nc" +
                        (nc.estado === "Autorizada" ? " pill-real" : "")
                      }
                      title={`Nota de crédito · ${nc.motivo}`}
                    >
                      NC · {nc.estado}
                    </span>
                  )}
                </td>
                <td>{money(Number(r.total))}</td>
                <td>
                  <span className={r.simulacion && !realListo ? "pill" : "pill pill-real"}>
                    {r.simulacion ? r.estado : `${r.estado} · SRI`}
                  </span>
                </td>
                <td>
                  {r.simulacion ? (
                    <span title="Sin validez tributaria hasta activar el SRI real">
                      {r.estado === "Error" ? "Error de emisión" : "En validación"}
                    </span>
                  ) : (
                    r.numero_autorizacion ??
                      r.mensaje ??
                      "Pendiente del webhook"
                  )}
                </td>
                <td>
                  <button
                    className="secondary"
                    disabled={r.estado !== "Autorizada" || ncActiva}
                    title={
                      r.estado !== "Autorizada"
                        ? "Sólo las facturas autorizadas pueden tener nota de crédito"
                        : ncActiva
                          ? "Esta factura ya tiene una nota de crédito"
                          : "Emitir nota de crédito (documento 04)"
                    }
                    onClick={() => {
                      setNotaFor(r);
                      setMotivo("");
                      setNotaResultado(null);
                    }}
                  >
                    Nota crédito
                  </button>{" "}
                  <button
                    className="secondary"
                    onClick={() =>
                      void download(r.id).catch((e) => setError(e.message))
                    }
                  >
                    XML
                  </button>{" "}
                  <button
                    className="secondary"
                    onClick={() =>
                      void printRide(r.id).catch((e) => setError(e.message))
                    }
                  >
                    Imprimir
                  </button>{" "}
                  <button
                    className="secondary"
                    onClick={() =>
                      void downloadRide(r.id).catch((e) => setError(e.message))
                    }
                  >
                    Descargar PDF RIDE
                  </button>{" "}
                  {r.clave_acceso && (
                    <button
                      className="secondary"
                      title="Ver código QR de la clave de acceso"
                      onClick={() => setQrFor(r)}
                    >
                      QR
                    </button>
                  )}{" "}
                  {(() => {
                    const email = (r as any).clientes?.email ?? "";
                    const subject = encodeURIComponent(
                        "Su comprobante MULTIFACTU - " + r.id.slice(0, 8),
                      ),
                      body = encodeURIComponent(
                        "Buen día.\n\nAdjunto el comprobante de MULTIFACTU (" +
                          r.id.slice(0, 8) + "), total " + money(Number(r.total)) +
                          ".\nPuede descargar el XML desde el sistema.\n\nGracias.",
                      ),
                      wa = encodeURIComponent(
                        "Buen día. Su comprobante MULTIFACTU (" +
                          r.id.slice(0, 8) + ") total " + money(Number(r.total)) +
                          ".",
                      );
                    return (
                      <>
                        {email ? (
                          <a
                            className="secondary"
                            style={{ textDecoration: "none" }}
                            href={"mailto:" + email + "?subject=" + subject + "&body=" + body}
                          >
                            Correo
                          </a>
                        ) : (
                          <button
                            className="secondary"
                            onClick={() => setError("El cliente no tiene correo registrado.")}
                          >
                            Correo (sin email)
                          </button>
                        )}{" "}
                        <a
                          className="secondary"
                          style={{ textDecoration: "none" }}
                          href={"https://wa.me/?text=" + wa}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                      </>
                    );
                  })()}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">Todavía no hay comprobantes.</div>
        )}
      </div>
      {qrFor && (
        <div className="modal-backdrop">
          <section
            className="emission-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Código QR del comprobante"
          >
            <button
              className="modal-close"
              onClick={() => setQrFor(null)}
              aria-label="Cerrar"
            >
              ×
            </button>
            <p className="eyebrow">CLAVE DE ACCESO</p>
            <h2>QR del comprobante</h2>
            <canvas ref={canvasRef} style={{ alignSelf: "center" }} />
            <small style={{ wordBreak: "break-all" }}>{qrFor.clave_acceso}</small>
            <small>
              Escanéalo para consultar el comprobante por su clave de acceso de
              49 dígitos. También va incluido en el PDF RIDE.
            </small>
            <button onClick={() => setQrFor(null)}>Cerrar</button>
          </section>
        </div>
      )}
      {notaFor && (
        <div className="modal-backdrop">
          <section
            className="emission-modal nota-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Nota de crédito"
          >
            <button
              className="modal-close"
              onClick={cerrarNota}
              aria-label="Cerrar"
            >
              ×
            </button>
            <p className="eyebrow">NOTA DE CRÉDITO · DOCUMENTO 04</p>
            <h2>Emitir nota de crédito</h2>
            <p>
              Sobre la factura <b>{notaFor.id.slice(0, 8)}</b> por{" "}
              {money(Number(notaFor.total))}. El motivo es obligatorio y viaja
              dentro del documento emitido.
            </p>
            {!notaResultado ? (
              <textarea
                className="nc-motivo"
                rows={4}
                maxLength={500}
                value={motivo}
                placeholder="Ej.: Devolución de mercadería entregada con defectos."
                onChange={(e) => setMotivo(e.target.value)}
              />
            ) : (
              <p
                className={notaResultado.ok ? "nc-ok" : "nc-fallo"}
                aria-live="polite"
              >
                {notaResultado.texto}
              </p>
            )}
            <div className="nc-actions">
              {!notaResultado ? (
                <>
                  <button
                    className="secondary"
                    onClick={cerrarNota}
                    disabled={notaCargando}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => void emitirNota()}
                    disabled={notaCargando || !motivo.trim()}
                  >
                    {notaCargando ? "Emitiendo…" : "Emitir nota"}
                  </button>
                </>
              ) : (
                <button onClick={cerrarNota}>Cerrar</button>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
