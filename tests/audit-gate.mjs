#!/usr/bin/env node
// Puerta de auditoría de dependencias: sale con código 1 si `npm audit`
// encuentra vulnerabilidades ALTAS o CRÍTICAS que no estén autorizadas.
//
// Cada autorización tiene fecha de caducidad: cuando pasa, la puerta vuelve a
// fallar y obliga a revisar el caso. Sirve para no ignorar el resto de
// hallazgos en silencio mientras un paquete concreto no tiene corrección.
import { execFileSync } from "node:child_process";

const AUTORIZADAS = {
  "GHSA-86w9-cpqp-85rv": {
    paquete: "node-forge",
    motivo:
      "Verificación de firma PKCS#1 v1.5: afecta a las claves ajenas, no a la validación propia. Sin versión corregida (rango <=1.4.0).",
    hasta: "2026-11-04",
  },
};

const hoy = new Date().toISOString().slice(0, 10);
const argumentos = ["audit", "--json"];
const maxBuffer = 32 * 1024 * 1024;

let salida = "",
  fallo = "";
try {
  // Cuando corre dentro de `npm run` se invoca el propio npm-cli de Node;
  // fuera de él se usa el lanzador del sistema (en Windows, con shell).
  const cli = process.env.npm_execpath;
  salida = cli && cli.endsWith(".js")
    ? execFileSync(process.execPath, [cli, ...argumentos], { encoding: "utf8", maxBuffer })
    : execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", argumentos, {
        encoding: "utf8",
        maxBuffer,
        shell: process.platform === "win32",
      });
} catch (error) {
  // npm audit devuelve código != 0 cuando hay hallazgos: el informe viene en stdout.
  salida = error.stdout?.toString() ?? "";
  fallo = (error.stderr?.toString() ?? error.message ?? "").trim();
}
if (!salida.trim()) {
  console.error("No se pudo ejecutar npm audit (sin informe).");
  if (fallo) console.error(fallo);
  process.exit(2);
}

let informe;
try {
  informe = JSON.parse(salida);
} catch {
  console.error("El informe de npm audit no es JSON válido.");
  process.exit(2);
}
if (informe.error) {
  console.error("npm audit devolvió un error:", informe.error);
  process.exit(2);
}

const graves = [];
const autorizadasUsadas = new Set();

for (const [paquete, dato] of Object.entries(informe.vulnerabilities ?? {})) {
  for (const aviso of dato.via ?? []) {
    if (typeof aviso !== "object") continue; // cadena de dependencias: lo informa su origen
    if (aviso.severity !== "high" && aviso.severity !== "critical") continue;
    const id = String(aviso.url ?? "").split("/").filter(Boolean).pop() ?? "";
    const autorizada = AUTORIZADAS[id];
    if (!autorizada) {
      graves.push({ paquete, id, severidad: aviso.severity, titulo: aviso.title });
      continue;
    }
    autorizadasUsadas.add(id);
    if (autorizada.hasta < hoy) {
      graves.push({
        paquete,
        id,
        severidad: aviso.severity,
        titulo: `${aviso.title} (autorización vencida el ${autorizada.hasta})`,
      });
      continue;
    }
    console.warn(
      `AVISO: ${aviso.severity} ignorado por acuerdo: ${id} en ${paquete} hasta ${autorizada.hasta}.`,
    );
    console.warn(`      ${autorizada.motivo}`);
  }
}

for (const [id, entrada] of Object.entries(AUTORIZADAS)) {
  if (!autorizadasUsadas.has(id))
    console.warn(
      `AVISO: la autorización ${id} ya no aparece en el informe; bórrala de tests/audit-gate.mjs.`,
    );
}

if (graves.length) {
  console.error(`\nFALLA la puerta de auditoría: ${graves.length} hallazgo(s) alto(s)/crítico(s):`);
  for (const falla of graves)
    console.error(
      `  - [${falla.severidad}] ${falla.paquete}${falla.id ? ` (${falla.id})` : ""}: ${falla.titulo}`,
    );
  console.error("\nCorrige la dependencia o documenta la excepción con su fecha en AUTORIZADAS.");
  process.exit(1);
}

const total = informe.metadata?.vulnerabilities ?? {};
console.log(
  `Puerta de auditoría superada: ${total.high ?? 0} altas y ${total.critical ?? 0} críticas autorizadas o resueltas; ${total.moderate ?? 0} medias y ${total.low ?? 0} bajas fuera de esta puerta.`,
);
