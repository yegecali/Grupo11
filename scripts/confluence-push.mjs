// Sube los documentos de knowledge/ a Confluence Cloud como espejo de lectura para personas.
// El motor (scripts/engine.mjs, scripts/flujo.mjs) sigue leyendo solo knowledge/: esta integración
// nunca decide nada, solo publica lo que ya está en el repositorio (AGENTS.md, regla 6).
import { readFile, readdir } from "node:fs/promises";
import { markdownAStorage } from "./confluence-formato.mjs";

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
  return String(value ?? "")
    .replace(/\b(Basic\s+)[A-Za-z0-9+/=]+/gi, "$1[redactado]")
    .replace(/\b(password|passwd|token|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, "$1: [redactado]");
}

const base = limpiarBase(requerido("CONFLUENCE_BASE_URL"));
const spaceKey = requerido("CONFLUENCE_SPACE_KEY");
const email = requerido("CONFLUENCE_EMAIL");
const token = requerido("CONFLUENCE_API_TOKEN");
const parentPageId = process.env.CONFLUENCE_PARENT_PAGE_ID?.trim() || null;
const auth = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

async function confluence(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const detalle = textoSeguro(await response.text()).slice(0, 700);
    throw new Error(`Confluence respondió HTTP ${response.status}: ${detalle}`);
  }
  return response.status === 204 ? null : response.json();
}

async function buscarPagina(titulo) {
  const params = new URLSearchParams({ spaceKey, title: titulo, expand: "version" });
  const resultado = await confluence(`/rest/api/content?${params}`);
  return resultado.results[0] ?? null;
}

async function publicarPagina(titulo, storageHtml) {
  const existente = await buscarPagina(titulo);
  const body = { type: "page", title: titulo, space: { key: spaceKey }, body: { storage: { value: storageHtml, representation: "storage" } } };
  if (parentPageId) body.ancestors = [{ id: parentPageId }];

  if (existente) {
    await confluence(`/rest/api/content/${existente.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...body, id: existente.id, version: { number: existente.version.number + 1 } }),
    });
    return { titulo, accion: "actualizada" };
  }
  await confluence("/rest/api/content", { method: "POST", body: JSON.stringify(body) });
  return { titulo, accion: "creada" };
}

function envolverCodigo(contenidoJson) {
  const cdata = contenidoJson.replace(/]]>/g, "]]]]><![CDATA[>");
  return (
    "<p>Este archivo se edita en el repositorio (<code>knowledge/</code>); esta página es solo de consulta. " +
    "El motor del agente nunca lee Confluence para decidir: la fuente de verdad real es el JSON del repositorio.</p>\n" +
    `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[${cdata}]]></ac:plain-text-body></ac:structured-macro>`
  );
}

const archivos = (await readdir("knowledge")).sort();
const resultados = [];

for (const archivo of archivos) {
  if (archivo.endsWith(".md")) {
    const markdown = await readFile(`knowledge/${archivo}`, "utf8");
    resultados.push(await publicarPagina(`KB: ${archivo}`, markdownAStorage(markdown)));
  } else if (archivo.endsWith(".json")) {
    const json = await readFile(`knowledge/${archivo}`, "utf8");
    resultados.push(await publicarPagina(`KB: ${archivo} (solo lectura)`, envolverCodigo(json)));
  }
}

for (const r of resultados) console.log(`${r.accion}: ${r.titulo}`);
console.log(`Listo: ${resultados.length} página(s) sincronizada(s) en Confluence.`);
