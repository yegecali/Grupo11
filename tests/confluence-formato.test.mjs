import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { markdownAStorage, storageAMarkdown } from "../scripts/confluence-formato.mjs";

test("convierte encabezados, listas y énfasis a storage de Confluence", () => {
  const md = "# Título\n\n## Sección\n1. Uno\n2. Dos\n\n- a\n- b\n\nTexto con **negrita**, *cursiva* y `code`.";
  const html = markdownAStorage(md);
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<h2>Sección<\/h2>/);
  assert.match(html, /<ol>\n<li>Uno<\/li>\n<li>Dos<\/li>\n<\/ol>/);
  assert.match(html, /<ul>\n<li>a<\/li>\n<li>b<\/li>\n<\/ul>/);
  assert.match(html, /<strong>negrita<\/strong>/);
  assert.match(html, /<em>cursiva<\/em>/);
  assert.match(html, /<code>code<\/code>/);
});

test("convierte un bloque de código y escapa caracteres especiales", () => {
  const md = "Antes `<x>` y luego:\n\n```\nconst a = 1 < 2;\n```";
  const html = markdownAStorage(md);
  assert.match(html, /<code>&lt;x&gt;<\/code>/);
  assert.match(html, /<ac:structured-macro ac:name="code">/);
  assert.match(html, /const a = 1 < 2;/);
});

// El viaje de ida y vuelta no promete espaciado idéntico (una lista justo bajo un encabezado puede
// ganar una línea en blanco): compara el contenido con las líneas en blanco colapsadas.
const sinBlancosDobles = (s) => s.trim().replace(/\n{2,}/g, "\n");

test("el viaje de ida y vuelta markdown -> storage -> markdown conserva el contenido", () => {
  const md = "# Pase a producción\n\n## Flujo general\n1. Crear el ticket.\n2. Obtener aprobaciones.\n\n- Estándar: bajo riesgo.\n- Normal: planificado.\n";
  const vuelta = storageAMarkdown(markdownAStorage(md));
  assert.equal(sinBlancosDobles(vuelta), sinBlancosDobles(md));
});

test("los estándares reales de knowledge/ sobreviven el viaje de ida y vuelta", async () => {
  const md = await readFile("knowledge/01-pase-a-produccion.md", "utf8");
  const vuelta = storageAMarkdown(markdownAStorage(md));
  assert.equal(sinBlancosDobles(vuelta), sinBlancosDobles(md));
});
