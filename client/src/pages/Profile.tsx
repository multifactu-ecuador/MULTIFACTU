import { useEffect, useState, type FormEvent } from "react";
import { db, check } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";

type Regimen = "general" | "rimpe_emprendedor" | "rimpe_negocio_popular";
const labelRegimen = (r: Regimen) =>
  r === "general"
    ? "Régimen General"
    : r === "rimpe_emprendedor"
      ? "RIMPE Emprendedor"
      : "RIMPE Negocio Popular";
type RucLookup = {
  ruc: string;
  razonSocial: string;
  estadoContribuyente: string;
  activo: boolean;
  actividadEconomicaPrincipal: string;
  regimenSri: string;
  categoria: string;
  regimen: Regimen;
  obligadoContabilidad: boolean;
  agenteRetencion: boolean;
  contribuyenteEspecial: boolean;
  actualizadoEn: string | null;
  establecimiento: {
    numero: string;
    direccion: string;
    nombreComercial: string;
    tipo: string;
    esMatriz: boolean;
  } | null;
  advertencias: string[];
};

export default function Profile() {
  const { access, refresh, allowed, session } = useAuth();
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [personalName, setPersonalName] = useState(access?.nombre ?? ""),
    [companyName, setCompanyName] = useState(access?.empresa.nombre ?? ""),
    [businessName, setBusinessName] = useState(access?.empresa.razon_social ?? ""),
    [ruc, setRuc] = useState(access?.empresa.ruc ?? ""),
    [address, setAddress] = useState(access?.empresa.direccion ?? ""),
    [regime, setRegime] = useState<Regimen>(access?.empresa.regimen ?? "general"),
    [accountingRequired, setAccountingRequired] = useState(access?.empresa.obligado_contabilidad ?? false),
    [agentResolution, setAgentResolution] = useState(access?.empresa.agente_retencion ?? ""),
    [specialResolution, setSpecialResolution] = useState(access?.empresa.contribuyente_especial ?? ""),
    [establishment, setEstablishment] = useState(access?.empresa.establecimiento ?? "001"),
    [emissionPoint, setEmissionPoint] = useState(access?.empresa.punto_emision ?? "001"),
    [lookupBusy, setLookupBusy] = useState(false),
    [rucLookup, setRucLookup] = useState<RucLookup | null>(null),
    [p12Pwd, setP12Pwd] = useState(""),
    [verifying, setVerifying] = useState(false),
    [ambiente, setAmbiente] = useState<"pruebas" | "produccion">(
      access?.empresa.ambiente_sri ?? "pruebas",
    ),
    [secuencias, setSecuencias] = useState<Record<string, number> | null>(null);
  const e = access!.empresa;
  const editable = access?.rol === "ADMIN" && allowed("facturacion");

  // Próximos números del SRI para el ambiente/establecimiento seleccionados.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await (db() as any)
          .from("secuenciales_sri")
          .select("tipo,ultimo")
          .eq("tenant_id", access!.tenant_id)
          .eq("ambiente", ambiente)
          .eq("establecimiento", establishment || "001")
          .eq("punto_emision", emissionPoint || "001");
        if (!vivo) return;
        if (r.error) setSecuencias({});
        else {
          const map: Record<string, number> = {};
          for (const row of r.data ?? []) map[row.tipo] = Number(row.ultimo);
          setSecuencias(map);
        }
      } catch {
        if (vivo) setSecuencias({});
      }
    })();
    return () => {
      vivo = false;
    };
  }, [access?.tenant_id, ambiente, establishment, emissionPoint]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ruc && !/^\d{13}$/.test(ruc)) {
      setError("El RUC debe tener 13 dígitos.");
      return;
    }
    if (rucLookup?.ruc === ruc && !rucLookup.activo) {
      setError("No puedes guardar un RUC que no está activo.");
      return;
    }
    if (agentResolution && !/^[1-9][0-9]{0,7}$/.test(agentResolution)) {
      setError(
        "La resolución de agente de retención va sin ceros a la izquierda y hasta 8 dígitos.",
      );
      return;
    }
    if (specialResolution && !/^[0-9A-Za-z]{3,13}$/.test(specialResolution)) {
      setError("La resolución de contribuyente especial debe tener de 3 a 13 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      check(
        await db()
          .from("empresas")
          .update({
            nombre: companyName.trim(),
            razon_social: businessName.trim(),
            ruc: ruc || null,
            direccion: address.trim(),
            regimen: regime,
            obligado_contabilidad: accountingRequired,
            agente_retencion: agentResolution || null,
            contribuyente_especial: specialResolution || null,
            establecimiento: establishment,
            punto_emision: emissionPoint,
          })
          .eq("id", access!.tenant_id),
      );
      if (personalName.trim() && personalName.trim() !== access!.nombre) {
        if (!session) throw Error("Sesión expirada.");
        check(
          await (db() as any)
            .from("usuarios_perfiles")
            .update({ nombre: personalName.trim() })
            .eq("id", session.user.id),
        );
      }
      await refresh();
      setMessage("Información empresarial actualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  /** Guarda sólo el ambiente de facturación (certificación o producción). */
  async function saveAmbiente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      check(
        await db()
          .from("empresas")
          .update({ ambiente_sri: ambiente })
          .eq("id", access!.tenant_id),
      );
      await refresh();
      setMessage(
        ambiente === "pruebas"
          ? "Ambiente de certificación (pruebas) guardado."
          : "Ambiente de producción guardado.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function lookupRuc() {    if (!/^\d{13}$/.test(ruc)) {
      setError("Ingresa un RUC de 13 dígitos para consultar.");
      return;
    }
    setLookupBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await db().functions.invoke("consultar-ruc", {
        body: { ruc },
      });
      if (response.error) {
        let detail = response.error.message;
        try {
          const body = await response.error.context.json();
          detail = body.error ?? detail;
        } catch {}
        throw Error(detail);
      }
      const result = response.data as RucLookup;
      if (!result || result.ruc !== ruc) throw Error("Respuesta fiscal inválida.");
      setRucLookup(result);
      if (!result.activo) {
        setError(`El RUC reporta estado ${result.estadoContribuyente || "DESCONOCIDO"}. No se aplicaron cambios.`);
        return;
      }
      setBusinessName(result.razonSocial || businessName);
      setCompanyName(result.establecimiento?.nombreComercial || companyName);
      setAddress(result.establecimiento?.direccion || address);
      setEstablishment(result.establecimiento?.numero || establishment);
      setRegime(result.regimen);
      setAccountingRequired(result.obligadoContabilidad);
      setMessage("Datos fiscales encontrados. Revísalos y guarda los cambios para aplicarlos.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo consultar el RUC.");
    } finally {
      setLookupBusy(false);
    }
  }
  async function upload(
    file: File | undefined,
    kind: "certificados" | "logos",
  ) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "certificados" && !file.name.toLowerCase().endsWith(".p12"))
        throw Error("Selecciona un archivo .p12");
      if (kind === "logos" && !["image/png", "image/jpeg"].includes(file.type))
        throw Error("El logo debe ser PNG o JPEG");
      const maxBytes = (kind === "certificados" ? 5 : 2) * 1024 * 1024;
      if (file.size > maxBytes)
        throw Error(
          kind === "certificados"
            ? "El certificado .p12 no puede superar 5 MB"
            : "La imagen no puede superar 2 MB",
        );
      const path =
        access!.tenant_id +
        "/" +
        crypto.randomUUID() +
        (kind === "certificados"
          ? ".p12"
          : file.type === "image/png"
            ? ".png"
            : ".jpg");
      check(
        await db().storage.from(kind).upload(path, file, { upsert: false }),
      );
      try {
        check(
          await db()
            .from("empresas")
            .update(
              kind === "certificados"
                ? { ruta_p12: path }
                : { logo_path: path },
            )
            .eq("id", access!.tenant_id),
        );
      } catch (e) {
        await db().storage.from(kind).remove([path]);
        throw e;
      }
      await refresh();
      setMessage("Archivo guardado en un bucket privado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }

  /** Verifica la contraseña contra el .p12 real en el servidor y, sólo si
   *  coincide, la guarda cifrada en Supabase Vault. */
  async function verifyPassword() {
    if (!p12Pwd) {
      setError("Escribe la contraseña del certificado primero.");
      return;
    }
    setVerifying(true);
    setError("");
    setMessage("");
    try {
      const response = await db().functions.invoke("verificar-p12", {
        body: { password: p12Pwd },
      });
      if (response.error) {
        let detail = response.error.message;
        try {
          const body = await response.error.context.json();
          detail = body.error ?? detail;
        } catch {}
        throw Error(detail);
      }
      const result = response.data as {
        passwordOk: boolean;
        code: string;
        mensaje?: string;
        expira?: string;
      };
      if (!result.passwordOk)
        throw Error(
          result.mensaje ?? "La contraseña no coincide con el certificado.",
        );
      // Contraseña real confirmada: guardarla cifrada en Vault.
      check(await db().rpc("guardar_p12_password", { p_password: p12Pwd }));
      await refresh();
      setP12Pwd("");
      const aviso =
        result.code === "VALID"
          ? ""
          : ` ${result.mensaje}${
              result.expira
                ? ` Caduca: ${new Date(result.expira).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}.`
                : ""
            }`;
      setMessage(
        `Contraseña verificada contra el certificado y guardada cifrada.${aviso}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo verificar la contraseña.",
      );
    } finally {
      setVerifying(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONFIGURACIÓN / TU IDENTIDAD</p>
          <h1>Perfil de mi empresa.</h1>
          <p>Datos del negocio y archivos privados separados por empresa.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <section className="card sri-card">
        <header className="sri-card-head">
          <span className="sri-mark">C</span>
          <h2>Integración con el SRI</h2>
        </header>
        <div className="sri-card-body">
          <p className="sri-ruc">
            {e.ruc ?? "Sin RUC configurado"}
            <br />
            <small>{e.razon_social}</small>
          </p>
          <ul className="sri-checks">
            <li className={e.ruc && /^[0-9]{13}$/.test(e.ruc) ? "ok" : "bad"}>
              {e.ruc && /^[0-9]{13}$/.test(e.ruc) ? "✓" : "⚠"} RUC registrado y válido
            </li>
            <li className={e.razon_social ? "ok" : "bad"}>
              {e.razon_social ? "✓" : "⚠"} Razón social completa
            </li>
            <li className={e.ruta_p12 ? "ok" : "bad"}>
              {e.ruta_p12 ? "✓" : "⚠"} Firma electrónica (.p12) cargada
            </li>
            <li className={e.p12_secret_id ? "ok" : "bad"}>
              {e.p12_secret_id ? "✓" : "⚠"} Contraseña del .p12 guardada
            </li>
            <li className={e.regimen ? "ok" : "bad"}>
              {e.regimen ? "✓" : "⚠"} Régimen tributario definido
            </li>
          </ul>
          {e.ruta_p12 ? (
            <p className="sri-connected" role="status">
              ✓ Su cuenta está conectada con el SRI. Los comprobantes se
              enviarán con firma electrónica válida.
            </p>
          ) : (
            <div className="sri-alert" role="alert">
              <span className="sri-warn">⚠</span>
              <div>
                <h3>Su cuenta no está conectada con el SRI</h3>
                <p>
                  Para poder sincronizar sus documentos electrónicos es
                  necesario que conecte su cuenta al SRI. Cargue su firma
                  electrónica (.p12) en "Logo y certificado" o adquiérala en
                  una entidad autorizada:
                </p>
                <a
                  className="sda-cta"
                  href="https://www.securitydata.net.ec/firma-electronica-en-ecuador/"
                  target="_blank"
                  rel="noreferrer"
                >
                  🛡 ¿No tienes firma electrónica? Cómprala en Security Data →
                </a>
              </div>
            </div>
          )}
          <div className="sri-actions">
            <button
              type="button"
              className="sri-connect"
              onClick={() => {
                document
                  .getElementById("p12-upload")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
                (
                  document.getElementById("p12-upload-input") as HTMLInputElement | null
                )?.focus();
              }}
            >
              Conectar
            </button>
          </div>
        </div>
      </section>
      <form className="card editor-grid" onSubmit={save}>
        <h2>Información empresarial</h2>
        <label>
          Nombre del acceso (usuario)
          <input
            value={personalName}
            onChange={(e) => setPersonalName(e.target.value)}
            disabled={!editable}
          />
        </label>
        <label>
          Nombre comercial
          <input
            name="nombre"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            required
            maxLength={160}
            disabled={!editable}
          />
        </label>
        <label>
          Razón social
          <input
            name="razon_social"
            value={businessName}
            onChange={(event) => setBusinessName(event.target.value)}
            required
            maxLength={160}
            disabled={!editable}
          />
        </label>
        <div className="ruc-lookup">
          <label>
            RUC (13 dígitos)
            <input
              name="ruc"
              value={ruc}
              onChange={(event) => {
                setRuc(event.target.value.replace(/\D/g, ""));
                setRucLookup(null);
              }}
              inputMode="numeric"
              pattern="[0-9]{13}"
              disabled={!editable || lookupBusy}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={!editable || lookupBusy || ruc.length !== 13}
            onClick={() => void lookupRuc()}
          >
            {lookupBusy ? "Consultando…" : "Consultar RUC"}
          </button>
        </div>
        {rucLookup && (
          <div className={rucLookup.activo ? "ruc-result" : "ruc-result warning"} role="status">
            <b>{rucLookup.activo ? "RUC activo" : `RUC ${rucLookup.estadoContribuyente || "sin estado"}`}</b>
            <span>{rucLookup.actividadEconomicaPrincipal || "Actividad económica no informada"}</span>
            <small>
              SRI: {rucLookup.regimenSri || "No informado"}
              {rucLookup.categoria ? ` · ${rucLookup.categoria}` : ""}
              {rucLookup.actualizadoEn ? ` · actualizado ${new Date(rucLookup.actualizadoEn).toLocaleDateString("es-EC")}` : ""}
            </small>
            {rucLookup.advertencias.map((warning) => <small key={warning}>⚠ {warning}</small>)}
          </div>
        )}
        <label>
          Dirección
          <input
            name="direccion"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            maxLength={200}
            disabled={!editable}
          />
        </label>
        <button disabled={busy || !editable}>Guardar información</button>
      </form>

      <form className="card" onSubmit={save}>
        <h2>Configuración tributaria</h2>
        <small>Régimen, secuencial y parámetros de emisión</small>
        <div className="regime-grid">
          {(
            [
              {
                id: "rimpe_emprendedor" as Regimen,
                title: "RIMPE Emprendedor",
                text: "Ingresos anuales hasta $300.000. Factura con IVA; declaras tus ventas de forma simplificada.",
              },
              {
                id: "rimpe_negocio_popular" as Regimen,
                title: "RIMPE Negocio Popular",
                text: "Ingresos anuales hasta $20.000. No cobra IVA y llevas un registro de ventas simplificado.",
              },
              {
                id: "general" as Regimen,
                title: "Régimen General",
                text: "Persona natural no obligada a llevar contabilidad. Facturas con IVA del 15%.",
              },
            ]
          ).map((option) => (
            <button
              type="button"
              key={option.id}
              className={"regime-card" + (regime === option.id ? " active" : "")}
              disabled={!editable}
              onClick={() => setRegime(option.id)}
            >
              <b>{option.title}</b>
              <span>{option.text}</span>
              {rucLookup?.regimen === option.id && (
                <em className="pill">SEGÚN EL SRI</em>
              )}
            </button>
          ))}
        </div>
        <p className="notice">
          MULTIFACTU emite Factura y Nota de Crédito para RIMPE y para Régimen
          General (persona natural no obligada a llevar contabilidad). Si el SRI
          te obliga a llevar contabilidad, actuar como agente de retención, o
          emitir guías de remisión, retenciones o ATS, deberás usar un sistema
          contable adicional.
        </p>
        {rucLookup?.regimen && rucLookup.regimen !== regime && (
          <p className="alert" role="alert">
            <b>El SRI registra tu RUC en {labelRegimen(rucLookup.regimen)}.</b>{" "}
            Facturar con otro régimen declara un dato falso en cada
            comprobante.{" "}
            <button
              type="button"
              className="linklike"
              disabled={!editable}
              onClick={() => setRegime(rucLookup.regimen)}
            >
              Usar {labelRegimen(rucLookup.regimen)}
            </button>
          </p>
        )}
        {rucLookup?.agenteRetencion && !agentResolution && (
          <p className="notice">
            El SRI te registra como agente de retención: ingresa el número de
            tu resolución para que aparezca en cada comprobante (Anexo 21).
          </p>
        )}
        {rucLookup?.contribuyenteEspecial && !specialResolution && (
          <p className="notice">
            El SRI te registra como contribuyente especial: ingresa el número
            de tu resolución para que aparezca en cada comprobante.
          </p>
        )}
        <div className="editor-grid" style={{ marginTop: 18 }}>
          <label className="checkbox">
            <input
              type="checkbox"
              name="obligado_contabilidad"
              checked={accountingRequired}
              onChange={(event) => setAccountingRequired(event.target.checked)}
              disabled={!editable}
            />
            <span>Obligado a llevar contabilidad</span>
          </label>
          <label>
            Agente de retención · N.º de resolución
            <input
              name="agente_retencion"
              value={agentResolution}
              onChange={(event) =>
                setAgentResolution(
                  event.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 8),
                )
              }
              inputMode="numeric"
              maxLength={8}
              placeholder="Vacío si no eres agente"
              disabled={!editable}
            />
          </label>
          <label>
            Contribuyente especial · N.º de resolución
            <input
              name="contribuyente_especial"
              value={specialResolution}
              onChange={(event) =>
                setSpecialResolution(
                  event.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 13),
                )
              }
              maxLength={13}
              placeholder="Vacío si no aplica"
              disabled={!editable}
            />
          </label>
          <label>
            Establecimiento
            <input
              name="establecimiento"
              value={establishment}
              onChange={(event) => setEstablishment(event.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              pattern="[0-9]{3}"
              required
              disabled={!editable}
            />
          </label>
          <label>
            Punto de emisión
            <input
              name="punto_emision"
              value={emissionPoint}
              onChange={(event) => setEmissionPoint(event.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              pattern="[0-9]{3}"
              required
              disabled={!editable}
            />
          </label>
          <button disabled={busy || !editable}>
            {busy ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </form>

      <form className="card" onSubmit={saveAmbiente}>
        <h2>Ambiente de facturación</h2>
        <small>Certificación (pruebas) o producción (facturas reales)</small>
        <div className="ambiente-grid">
          <button
            type="button"
            className={"ambiente-card" + (ambiente === "pruebas" ? " active" : "")}
            disabled={!editable}
            onClick={() => setAmbiente("pruebas")}
          >
            <b>Certificación (pruebas)</b>
            <span>Las facturas se envían al servidor de pruebas del SRI.</span>
            <span>Sin validez legal · ideal para probar tu flujo.</span>
            <span>Puedes emitir sin riesgo tributario.</span>
            {ambiente === "pruebas" && <em className="pill pill-real">ACTIVO</em>}
          </button>
          <button
            type="button"
            className={"ambiente-card" + (ambiente === "produccion" ? " active" : "")}
            disabled={!editable}
            onClick={() => setAmbiente("produccion")}
          >
            <b>Producción (facturas reales)</b>
            <span>Las facturas se envían al SRI real y tienen validez legal.</span>
            <span>La anulación exige Nota de Crédito.</span>
            <span>Activa cuando tu firma y datos estén verificados.</span>
            {ambiente === "produccion" && <em className="pill pill-real">ACTIVO</em>}
          </button>
        </div>
        <div className="summary-box">
          <p className="eyebrow">ANTES DE GUARDAR</p>
          <dl>
            <div><dt>Negocio</dt><dd>{companyName || e.nombre}</dd></div>
            <div><dt>RUC</dt><dd>{ruc || e.ruc || "—"}</dd></div>
            <div><dt>Régimen</dt><dd>{labelRegimen(regime)}</dd></div>
            <div><dt>IVA</dt><dd>{regime === "rimpe_negocio_popular" ? "0%" : "15%"}</dd></div>
            <div><dt>Firma</dt>
              <dd className={e.ruta_p12 && e.p12_secret_id ? "ok" : "bad"}>
                {e.ruta_p12 && e.p12_secret_id ? "✓ lista" : "⚠ falta"}
              </dd>
            </div>
            <div><dt>Emisión</dt><dd>{establishment || "001"}-{emissionPoint || "001"}</dd></div>
            <div><dt>Próxima factura</dt>
              <dd>
                {(establishment || "001")}-{(emissionPoint || "001")}-
                {String((secuencias?.["01"] ?? 0) + 1).padStart(9, "0")}
              </dd>
            </div>
            <div><dt>Próxima nota de crédito</dt>
              <dd>{String((secuencias?.["04"] ?? 0) + 1).padStart(9, "0")}</dd>
            </div>
          </dl>
        </div>
        {ambiente === "pruebas" ? (
          <p className="notice">
            Modo pruebas: nada de lo que emitas tendrá validez legal.
          </p>
        ) : (
          <p className="alert" role="alert">
            <b>Modo producción:</b> cada comprobante que emitas se registra
            ante el SRI con tu firma electrónica.
          </p>
        )}
        <button disabled={busy || !editable || ambiente === e.ambiente_sri}>
          {busy ? "Guardando…" : "Guardar ambiente"}
        </button>
      </form>

      <section className="card">
        <h2>Logo y certificado</h2>
        <label>
          Logo de empresa (PNG/JPEG)
          <input
            type="file"
            accept="image/png,image/jpeg"
            disabled={busy || !editable}
            onChange={(event) => void upload(event.target.files?.[0], "logos")}
          />
        </label>
        <small>{e.logo_path ? "Logo configurado" : "Sin logo cargado"}</small>
        <label id="p12-upload">
          Certificado .p12
          <input
            id="p12-upload-input"
            type="file"
            accept=".p12"
            disabled={busy || !editable}
            onChange={(event) =>
              void upload(event.target.files?.[0], "certificados")
            }
          />
        </label>
        <p>
          {e.ruta_p12
            ? "Certificado privado almacenado"
            : "No has cargado un certificado"}
        </p>
        <label>
          Contraseña del certificado .p12
          <input
            type="password"
            name="p12_password"
            autoComplete="off"
            placeholder="Requerida para firmar en modo real"
            disabled={busy || verifying || !editable}
            value={p12Pwd}
            onChange={(event) => setP12Pwd(event.target.value)}
          />
        </label>
        <p>
          <button
            type="button"
            className="button light"
            disabled={busy || verifying || !editable || !p12Pwd}
            onClick={() => void verifyPassword()}
          >
            {verifying ? "Verificando contra el certificado…" : "Verificar contraseña"}
          </button>
        </p>
        <small>
          El servidor la comprueba contra tu .p12 real (caducidad y RUC
          incluidos) y, sólo si coincide, la guarda cifrada. Nunca se almacena
          una contraseña sin verificar.
        </small>
        <p className="notice">
          La firma XAdES-BES y el envío al SRI están habilitados vía
          SRI_MODE=real en la Edge Function. El .p12 se almacena en un bucket
          privado y la firma ocurre en el servidor, nunca en el navegador.
        </p>
        {e.ruta_p12 && (
          <p className="alert" role="alert">
            <b>Certificado electrónico importado.</b> En esta fase NO se
            autorizan comprobantes ante el SRI: todas las operaciones de
            ventas/alquiler se registran como <b>ventas internas</b>. Conecta
            tu webhook y SRI_MODE=real antes de facturar oficialmente.
          </p>
        )}
      </section>
    </section>
  );
}
