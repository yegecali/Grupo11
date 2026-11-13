// Crea un ticket Jira Cloud a partir de un Issue [OCD]. Las credenciales solo viven en el entorno del workflow.
import { readFile } from "node:fs/promises";

const requerido = (nombre) => {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta configurar ${nombre} en GitHub Actions.`);
  return valor;
};

function limpiarBase(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("JIRA_BASE_URL debe ser una URL HTTPS de Jira Cloud, sin credenciales ni parámetros.");
  }
  return parsed.origin;
}

function textoSeguro(value) {
  return String(value ?? "")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redactado]")
    .replace(/\b(password|passwd|token|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, "$1: [redactado]");
}

function adf(text) {
  const content = textoSeguro(text).split(/\r?\n/).map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return { version: 1, type: "doc", content };
}

function seccionIssue(body) {
  return textoSeguro(body || "(La Issue no tiene descripción.)");
}

async function gh(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${requerido("GH_TOKEN")}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub API respondió HTTP ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

const repo = requerido("GH_REPO");
const numero = requerido("ISSUE");
if (!/^\d+$/.test(numero)) throw new Error("ISSUE debe ser un número.");
const issue = await gh(`/repos/${repo}/issues/${numero}`);
if (!issue.title.startsWith("[OCD]")) throw new Error("Solo se pueden exportar Issues [OCD].");

const marker = `<!-- jira-ocd:${repo}#${numero} -->`;
let previo = null;
for (let pagina = 1; pagina <= 10 && !previo; pagina += 1) {
  const comments = await gh(`/repos/${repo}/issues/${numero}/comments?per_page=100&page=${pagina}`);
  previo = comments.find((comment) => comment.body.includes(marker));
  if (comments.length < 100) break;
}
if (previo) {
  console.log("Este Issue ya está vinculado a Jira; no se creó un duplicado.");
  process.exit(0);
}

const flujo = JSON.parse(await readFile("knowledge/ocd-flujo.json", "utf8"));
const base = limpiarBase(requerido("JIRA_BASE_URL"));
const project = requerido("JIRA_PROJECT_KEY");
const issueType = requerido("JIRA_ISSUE_TYPE");
const email = requerido("JIRA_EMAIL");
const token = requerido("JIRA_API_TOKEN");
const sourceUrl = issue.html_url;
const states = Object.values(flujo.estados).sort((a, b) => a.orden - b.orden)
  .map((state) => `${state.orden}. ${state.nombre} — ${state.queHacer}`).join("\n");
const sets = Object.values(flujo.conjuntos).map((set) => `• ${set.etiqueta}`).join("\n");
const description = [
  "OCD generado desde la Issue de GitHub. Los datos del formulario se conservan abajo.",
  `Issue de origen: ${sourceUrl}`,
  "",
  "Pasos documentados del flujo OCD",
  states,
  "",
  "Los cuatro conjuntos de instrucciones requeridos para pasar a Revisiones técnicas:",
  sets,
  "",
  "Documentación: documentacion/06-ocd-pase-a-produccion.md y documentacion/13-flujo-ocd.md",
  "",
  "Datos y pasos enviados en la Issue",
  seccionIssue(issue.body),
].join("\n");

const response = await fetch(`${base}/rest/api/3/issue`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fields: {
      project: { key: project },
      summary: textoSeguro(issue.title).slice(0, 255),
      issuetype: /^\d+$/.test(issueType) ? { id: issueType } : { name: issueType },
      description: adf(description),
      labels: ["ocd", "github"],
    },
  }),
});
if (!response.ok) {
  const detalle = await response.text();
  throw new Error(`Jira respondió HTTP ${response.status}: ${textoSeguro(detalle).slice(0, 700)}`);
}
const ticket = await response.json();
if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(ticket.key ?? "")) throw new Error("Jira no devolvió una clave de ticket válida.");
const ticketUrl = `${base}/browse/${ticket.key}`;
await gh(`/repos/${repo}/issues/${numero}/comments`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ body: `${marker}\n🎫 Ticket de Jira creado desde esta Issue: [${ticket.key}](${ticketUrl}).` }),
});
console.log(`Ticket Jira creado: ${ticket.key}`);
