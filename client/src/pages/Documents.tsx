import { useEffect, useState } from "react";
import { db, check, money } from "../lib/supabase";
import type { Invoice } from "../lib/types";

const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => htmlEntities[character]);

export default function Documents() {
  const [rows, setRows] = useState<Invoice[]>([]),
    [error, setError] = useState("");
  const load = async () =>
    setRows(
      (check(
        await db()
          .from("facturas_sri")
          .select("*,clientes(email,nombre)")
          .order("fecha", { ascending: false }),
      ) ?? []) as Invoice[],
    );
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
      <p><b>Clave de acceso:</b> ${escapeHtml((row as any).clave_acceso ?? "(simulada)")}</p>
      <table><thead><tr><th>Detalle</th><th>Cant.</th><th>Precio</th><th>Base</th><th>IVA</th><th>Impuesto</th></tr></thead><tbody>${items}</tbody></table>
      <div class="totals">
        <b>Total sin IVA:</b> ${moneyNum(Number((row as any).subtotal_0) + Number((row as any).subtotal_5) + Number((row as any).subtotal_15))}<br/>
        <b>IVA:</b> ${moneyNum(Number((row as any).iva_5 ?? 0) + Number((row as any).iva_15 ?? 0))}<br/>
        <b>Total:</b> ${moneyNum(row.total)}
      </div>
      ${(row as any).clave_acceso ? `<div style="text-align:center;margin-top:18px"><p><b>Clave de acceso:</b> ${escapeHtml((row as any).clave_acceso)}</p></div>` : ""}
      <p style="margin-top:40px">Representación impresa del comprobante electrónico (RIDE) — fase de demostración.</p>
      <button onclick="window.print()">Imprimir</button>
      <script>setTimeout(()=>window.print(),350);</script>
    </body></html>`;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) throw Error("El navegador bloqueó la ventana");
    w.document.write(html);
    w.document.close();
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
    link.download = "MULTIFACTU-simulacion-sin-validez.xml";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPROBANTES / DEMOSTRACIÓN</p>
          <h1>Tu operación, ordenada.</h1>
          <p>
            Los estados de esta versión son simulados y no prueban aceptación
            del SRI.
          </p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
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
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.fecha}</td>
                <td>{r.id.slice(0, 8)}</td>
                <td>{money(Number(r.total))}</td>
                <td>
                  <span className="pill">{r.estado} · demo</span>
                </td>
                <td>
                  {r.numero_autorizacion ??
                    r.mensaje ??
                    "Pendiente del webhook"}
                </td>
                <td>
                  <button
                    className="secondary"
                    onClick={() =>
                      void download(r.id).catch((e) => setError(e.message))
                    }
                  >
                    XML demo
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
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty-state">Todavía no hay comprobantes.</div>
        )}
      </div>
    </section>
  );
}
