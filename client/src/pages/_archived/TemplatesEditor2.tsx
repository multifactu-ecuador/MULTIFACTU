import { useEffect, useState, useCallback } from "react";
import { db, check } from "../lib/supabase";
import { useAuth } from "../auth/AuthContext";
import { Upload, Save, Eye, Palette, Image, Trash2, Plus, FileText, Layout } from "lucide-react";

type Template = {
  id: string;
  tenant_id: string;
  tipo: "factura" | "nota_credito" | "contrato" | "orden_venta" | "recibo";
  nombre: string;
  es_predeterminada: boolean;
  logo_url: string | null;
  color_primario: string;
  color_secundario: string;
  fuente: string;
  tamano_fuente_base: number;
  cabecera: Record<string, boolean>;
  pie_pagina: Record<string, any>;
  campos_personalizados: Array<{ clave: string; valor: string; mostrar_en: string }>;
  html_template: string | null;
  css_template: string | null;
  creado_en: string;
  actualizado_en: string;
};


const TIPOS = [
  { value: "factura", label: "Factura", icon: FileText },
  { value: "nota_credito", label: "Nota de crÃ©dito", icon: FileText },
  { value: "contrato", label: "Contrato", icon: Layout },
  { value: "orden_venta", label: "Orden de venta", icon: Layout },
  { value: "recibo", label: "Recibo", icon: FileText },
] as const;


const FUENTES = ["Helvetica", "Times-Roman", "Courier", "Helvetica-Bold", "Times-Bold"];


export default function TemplatesEditor() {
  const { access } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [activeTipo, setActiveTipo] = useState<"factura" | "nota_credito" | "contrato" | "orden_venta" | "recibo">("factura");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({});

  const load = useCallback(async () => {
    if (!access) return;
    setLoading(true);
    try {
      const { data, error } = await (db() as any).from("plantillas_documento")
        .select("*").eq("tenant_id", access.tenant_id).order("tipo");
      if (error) throw error;
      setTemplates((data ?? []) as any[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando plantillas");
    } finally {
      setLoading(false);
    }
  }, [access]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = templates.find(t => t.tipo === activeTipo && t.es_predeterminada);
    if (t) {
      setForm({
        id: t.id, nombre: t.nombre, es_predeterminada: t.es_predeterminada,
        logo_url: t.logo_url, color_primario: t.color_primario,
        color_secundario: t.color_secundario, fuente: t.fuente,
        tamano_fuente_base: t.tamano_fuente_base, cabecera: t.cabecera || {},
        pie_pagina: t.pie_pagina || {}, campos_personalizados: t.campos_personalizados || [],
        html_template: t.html_template || "", css_template: t.css_template || "",
      });
    } else {
      setForm({
        nombre: `Plantilla ${activeTipo}`, es_predeterminada: true, logo_url: null,
        color_primario: "#1e40af", color_secundario: "#ffffff", fuente: "Helvetica",
        tamano_fuente_base: 8,
        cabecera: { mostrar_ruc: true, mostrar_direccion: true, mostrar_telefono: true, mostrar_email: true },
        pie_pagina: { texto_legal: "Este documento es una representacion grafica de un comprobante electronico", mostrar_qr: true, mostrar_web: true },
        campos_personalizados: [], html_template: "", css_template: "",
      });
    }
  }, [activeTipo, templates]);

  const handleChange = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));
  const handleNestedChange = (parent: string, key: string, value: any) => setForm(f => ({ ...f, [parent]: { ...f[parent], [key]: value } }));
  const handleCampoChange = (index: number, field: string, value: string) => setForm(f => { const arr = [...(f.campos_personalizados || [])]; arr[index] = { ...arr[index], [field]: value }; return { ...f, campos_personalizados: arr }; });
  const addCampo = () => setForm(f => ({ ...f, campos_personalizados: [...(f.campos_personalizados || []), { clave: "", valor: "", mostrar_en: "factura" }] }));
  const removeCampo = (index: number) => setForm(f => { const arr = [...(f.campos_personalizados || [])]; arr.splice(index, 1); return { ...f, campos_personalizados: arr }; });
  const uploadLogo = async (file: File) => { if (!access) return; const path = `${access.tenant_id}/logo-${Date.now()}.${file.type.split("/")[1]}`; try { await db().storage.from("logos").upload(path, file, { upsert: true }); const { data } = await db().storage.from("logos").getPublicUrl(path); handleChange("logo_url", data.publicUrl); } catch (e) { setError(e instanceof Error ? e.message : "Error subiendo logo"); } };
  const removeLogo = () => handleChange("logo_url", null);
  const save = async () => { if (!access) return; if (!form.nombre?.trim()) { setError("El nombre es requerido"); return; } setSaving(true); setError(""); try { const payload = { id: form.id, tenant_id: access.tenant_id, tipo: activeTipo, nombre: form.nombre.trim(), es_predeterminada: form.es_predeterminada, logo_url: form.logo_url, color_primario: form.color_primario, color_secundario: form.color_secundario, fuente: form.fuente, tamano_fuente_base: form.tamano_fuente_base, cabecera: form.cabecera, pie_pagina: form.pie_pagina, campos_personalizados: form.campos_personalizados, html_template: form.html_template, css_template: form.css_template }; const { error } = await (db() as any).from("plantillas_documento").upsert(payload, { onConflict: "tenant_id,tipo,nombre" }); if (error) throw error; await load(); } catch (e) { setError(e instanceof Error ? e.message : "Error guardando plantilla"); } finally { setSaving(false); } };
  const deleteTemplate = async (id: string) => { if (!confirm("Eliminar?")) return; try { const { error } = await (db() as any).from("plantillas_documento").delete().eq("id", id); if (error) throw error; await load(); } catch (e) { setError(e instanceof Error ? e.message : "Error eliminando"); } };
  const duplicateTemplate = async (t: any) => { const newName = `${t.nombre} (copia)`; try { const { error } = await (db() as any).from("plantillas_documento").insert({ ...t, nombre: `${t.nombre} (copia)`, es_predeterminada: false }); if (error) throw error; await load(); } catch (e) { setError(e instanceof Error ? e.message : "Error duplicando"); } };

  const TIPOS = [ { value: "factura", label: "Factura", icon: FileText }, { value: "nota_credito", label: "Nota de crÃ©dito", icon: FileText }, { value: "contrato", label: "Contrato", icon: Layout }, { value: "orden_venta", label: "Orden de venta", icon: Layout }, { value: "recibo", label: "Recibo", icon: FileText } ] as const;

  const FUENTES = ["Helvetica", "Times-Roman", "Courier", "Helvetica-Bold", "Times-Bold"];
  if (loading) return <div className="loading">Cargando...</div>;

  return (

    <section>

      <div className="page-heading"><div><p className="eyebrow">CONFIGURACIÃ“N / PLANTILLAS</p><h1>Personaliza tus documentos.</h1><p>Logo, colores, cabecera, pie y campos.</p></div><button className="button" onClick={() => setForm({})} style={{ marginLeft: "auto" }}><Plus size={16} /> Nueva plantilla</button></div>
      {error && <p className="error">{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "24px" }}>

        <aside className="card" style={{ padding: "16px", height: "fit-content", position: "sticky", top: "24px" }}><h3 style={{ marginBottom: "12px", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.5px", color: "#6b7280" }}>TIPO DE DOCUMENTO</h3>{TIPOS.map(t => (<button key={t.value} className={activeTipo === t.value ? "active" : ""} onClick={() => setActiveTipo(t.value as any)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "12px", marginBottom: "6px", border: "none", background: activeTipo === t.value ? "var(--accent)" : "transparent", color: activeTipo === t.value ? "#fff" : "inherit", borderRadius: "8px", cursor: "pointer", fontWeight: activeTipo === t.value ? "600" : "400", transition: "all 0.15s" }}><t.icon size={18} /><span>{t.label}</span>{templates.filter(tp => tp.tipo === t.value).length > 0 && (<span style={{ background: "rgba(255,255,255,0.2)", padding: "2px 6px", borderRadius: "10px", fontSize: "11px" }}>{templates.filter(tp => tp.tipo === t.value).length}</span>)}</button>))}</aside>

        <main className="card" style={{ padding: "24px", maxHeight: "calc(100vh - 200px)", overflow: "auto" }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}><div><h2 style={{ margin: 0, fontSize: "22px" }}>Editor: {TIPOS.find(t => t.value === activeTipo)?.label}</h2><p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: "13px" }}>Configura plantilla para <strong>{TIPOS.find(t => t.value === activeTipo)?.label}</strong></p></div><div style={{ display: "flex", gap: "8px" }}>{templates.filter(t => t.tipo === activeTipo).map(t => (<button key={t.id} className="secondary" onClick={() => duplicateTemplate(t)} style={{ fontSize: "12px" }}><Plus size={14} /> Duplicar</button>))}</div></div>
          {error && <p className="error">{error}</p>}

          <form onSubmit={e => { e.preventDefault(); save(); }} style={{ display: "grid", gap: "24px" }}>

            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px" }}><legend style={{ fontWeight: "600", fontSize: "14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><Image size={18} /> Identidad visual</legend><div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "16px", alignItems: "center", marginBottom: "16px" }}><label style={{ fontWeight: "500", fontSize: "13px" }}>Logo empresa</label><div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}><div style={{ width: 80, height: 80, border: "1px dashed #d1d5db", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: form.logo_url ? `url(${form.logo_url}) center/cover` : "#f9fafb", borderRadius: 8, overflow: "hidden" }}>{form.logo_url && <img src={form.logo_url} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />}</div><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}><input type="file" accept="image/*" id="logo-upload" style={{ display: "none" }} ref={el => { if (el) (window as any).logoInput = el; }} onChange={e => uploadLogo(e.target.files?.[0])} /><button type="button" className="secondary" onClick={() => (window as any).logoInput?.click()}><Image size={16} /> Subir logo</button>{form.logo_url && <button type="button" className="secondary" onClick={removeLogo} style={{ color: "#ef4444" }}>Eliminar</button>}</div></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "16px" }}><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>Color primario<input type="color" value={form.color_primario} onChange={e => handleChange("color_primario", e.target.value)} style={{ height: "36px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }} /></label><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>Color secundario<input type="color" value={form.color_secundario} onChange={e => handleChange("color_secundario", e.target.value)} style={{ height: "36px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }} /></label><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>Fuente<select value={form.fuente} onChange={e => handleChange("fuente", e.target.value)} style={{ padding: "8px", border: "1px solid #ccc", borderRadius: 6 }}>{FUENTES.map(f => <option key={f} value={f}>{f}</option>)}</select></label><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>TamaÃ±o base<input type="number" min="6" max="14" value={form.tamano_fuente_base} onChange={e => handleChange("tamano_fuente_base", Number(e.target.value))} style={{ padding: "8px", border: "1px solid #ccc", borderRadius: 6 }} /></label></div></fieldset>

            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px" }}><legend style={{ fontWeight: "600", fontSize: "14px", marginBottom: "16px" }}>Cabecera</legend><div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>{[{ key: "mostrar_ruc", label: "RUC" }, { key: "mostrar_direccion", label: "DirecciÃ³n" }, { key: "mostrar_telefono", label: "TelÃ©fono" }, { key: "mostrar_email", label: "Email" }].map(f => (<label key={f.key} className="checkbox" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}><input type="checkbox" checked={form.cabecera?.[f.key] ?? true} onChange={e => handleNestedChange("cabecera", f.key, e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--accent)" }} /><span>{f.label}</span></label>))}</div></fieldset>

            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px" }}><legend style={{ fontWeight: "600", fontSize: "14px", marginBottom: "16px" }}>Pie de pÃ¡gina</legend><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>Texto legal<textarea value={form.pie_pagina?.texto_legal || ""} onChange={e => handleNestedChange("pie_pagina", "texto_legal", e.target.value)} rows={3} style={{ padding: "10px", border: "1px solid #ccc", borderRadius: 6, fontSize: "13px", fontFamily: "inherit", resize: "vertical" }} placeholder="Texto legal..." /></label><label className="checkbox" style={{ display: "flex", alignItems: "flex-end", gap: "8px", cursor: "pointer" }}><input type="checkbox" checked={form.pie_pagina?.mostrar_qr ?? true} onChange={e => handleNestedChange("pie_pagina", "mostrar_qr", e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }} /><span style={{ fontSize: "13px" }}>QR</span></label><label className="checkbox" style={{ display: "flex", alignItems: "flex-end", gap: "8px", cursor: "pointer" }}><input type="checkbox" checked={form.pie_pagina?.mostrar_web ?? true} onChange={e => handleNestedChange("pie_pagina", "mostrar_web", e.target.checked)} style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }} /><span style={{ fontSize: "13px" }}>Web</span></label></div></fieldset>

            <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}><legend style={{ fontWeight: "600", fontSize: "14px", margin: 0 }}>Campos personalizados</legend><button type="button" className="secondary" onClick={() => handleChange("campos_personalizados", [...(form.campos_personalizados || []), { clave: "", valor: "", mostrar_en: "factura" }])}><Plus size={16} /> Agregar</button></div>{(form.campos_personalizados || []).length === 0 ? (<p style={{ color: "#9ca3af", fontSize: "13px", textAlign: "center", padding: "20px" }}>Sin campos. Agrega uno.</p>) : (<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{(form.campos_personalizados || []).map((cp, i) => (<div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 140px 40px", gap: "8px", marginBottom: "8px", alignItems: "center" }}><input placeholder="Clave" value={cp.clave} onChange={e => handleCampoChange(i, "clave", e.target.value)} style={{ padding: "10px", border: "1px solid #ccc", borderRadius: 6, fontSize: "13px" }} /><input placeholder="Valor" value={cp.valor} onChange={e => handleCampoChange(i, "valor", e.target.value)} style={{ padding: "10px", border: "1px solid #ccc", borderRadius: 6, fontSize: "13px" }} /><select value={cp.mostrar_en} onChange={e => handleCampoChange(i, "mostrar_en", e.target.value)} style={{ padding: "10px", border: "1px solid #ccc", borderRadius: 6, fontSize: "13px" }}><option value="factura">Factura</option><option value="nota_credito">Nota crÃ©dito</option><option value="contrato">Contrato</option><option value="orden_venta">Orden venta</option><option value="recibo">Recibo</option><option value="todos">Todos</option></select><button type="button" className="secondary" onClick={() => removeCampo(i)} style={{ padding: "10px", color: "#ef4444" }}><Trash2 size={16} /></button></div>))}</div>)}</fieldset><fieldset style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "20px" }}><legend style={{ fontWeight: "600", fontSize: "14px", marginBottom: "16px" }}>Plantilla HTML/CSS (opcional)</legend><p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "12px" }}>Usa {{cliente.nombre}}, {{total}}, {{logo}}. HTML/CSS.</p><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}><div><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>HTML<textarea value={form.html_template || ""} onChange={e => handleChange("html_template", e.target.value)} rows={12} placeholder="<div class='factura'>...</div>" style={{ width: "100%", padding: "12px", fontFamily: "monospace", fontSize: "12px", border: "1px solid #ccc", borderRadius: 6, resize: "vertical" }} /></label></div><div><label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "500" }}>CSS<textarea value={form.css_template || ""} onChange={e => handleChange("css_template", e.target.value)} rows={12} placeholder=".factura { color: #1e40af; }" style={{ width: "100%", padding: "12px", fontFamily: "monospace", fontSize: "12px", border: "1px solid #ccc", borderRadius: 6, resize: "vertical" }} /></label></div></fieldset><div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px", paddingTop: "16px", borderTop: "1px solid #e5e7eb" }}><button type="button" className="secondary" onClick={() => load()}>{saving ? "Guardando..." : "Cancelar"}</button><button type="submit" className="button" disabled={saving}><Save size={16} /> {saving ? "Guardando..." : "Guardar plantilla"}</button></div></form></main></div></div></div></section>)}}export default TemplatesEditor
