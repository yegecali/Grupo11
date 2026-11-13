// Trae de Confluence los estándares editables (knowledge/0*.md) para que un PR los revise antes
// de fusionarlos. Nunca escribe los JSON de knowledge/: esos solo se editan en el repositorio
// (AGENTS.md, regla 6) porque no tienen una representación de texto enriquecido confiable.
import { readFile, writeFile, readdir, appendFile } from "node:fs/promises";
import { storageAMarkdown } from "./confluence-formato.mjs";

const requerido = (nombre) => {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta configurar ${nombre} en GitHub Actions.`);
  return valor;
};

function limpiarBase(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("CONFLUENCE_BASE_URL debe ser una URL HTTPS de Confluence, sin credenciales ni parámetros.");
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
}

function textoSeguro(value) {
  return String(value ?? "").replace(/\b(Basic\s+)[A-Za-z0-9+/=]+/gi, "$1[redactado]");
}

const base = limpiarBase(requerido("CONFLUENCE_BASE_URL"));
const spaceKey = requerido("CONFLUENCE_SPACE_KEY");
const email = requerido("CONFLUENCE_EMAIL");
const token = requerido("CONFLUENCE_API_TOKEN");
const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

async function confluence(path) {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Confluence respondió HTTP ${response.status}: ${textoSeguro(await response.text()).slice(0, 700)}`);
  return response.json();
}

async function traerPagina(titulo) {
  const params = new URLSearchParams({ spaceKey, title: titulo, expand: "body.storage" });
  const resultado = await confluence(`/rest/api/content?${params}`);
  return resultado.results[0] ?? null;
}

const archivosMd = (await readdir("knowledge")).filter((f) => f.endsWith(".md")).sort();
const cambiados = [];

for (const archivo of archivosMd) {
  const pagina = await traerPagina(`KB: ${archivo}`);
  if (!pagina) {
    console.log(`Sin página en Confluence para ${archivo}; se deja igual.`);
    continue;
  }
  const actual = await readFile(`knowledge/${archivo}`, "utf8");
  const nuevo = storageAMarkdown(pagina.body.storage.value);
  if (nuevo.trim() !== actual.trim()) {
    await writeFile(`knowledge/${archivo}`, nuevo, "utf8");
    cambiados.push(archivo);
    console.log(`Actualizado desde Confluence: ${archivo}`);
  } else {
    console.log(`Sin cambios: ${archivo}`);
  }
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `cambios=${cambiados.length > 0}\narchivos=${cambiados.join(", ")}\n`);
}
console.log(cambiados.length > 0 ? `Archivos con cambios: ${cambiados.join(", ")}` : "No hay cambios que traer.");
