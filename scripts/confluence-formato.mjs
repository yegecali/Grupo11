// Conversión Markdown ⇄ formato "storage" (XHTML) de Confluence. Sin dependencias: solo cubre
// los elementos que usan los estándares de knowledge/ (encabezados, listas, código, enlaces, énfasis).
// Formato más complejo (tablas, imágenes, citas) no se garantiza en el viaje de ida y vuelta.

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function inlineAStorage(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function cdataSeguro(texto) {
  return String(texto).replace(/]]>/g, "]]]]><![CDATA[>");
}

/** Convierte Markdown (el usado en knowledge/*.md) a formato storage de Confluence. */
export function markdownAStorage(markdown) {
  const lineas = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;
  let listaActual = null; // "ul" | "ol" | null

  function cerrarLista() {
    if (listaActual) {
      html.push(`</${listaActual}>`);
      listaActual = null;
    }
  }

  while (i < lineas.length) {
    const linea = lineas[i];

    if (/^```/.test(linea)) {
      cerrarLista();
      const cierre = lineas.indexOf("```", i + 1);
      const fin = cierre === -1 ? lineas.length : cierre;
      const codigo = lineas.slice(i + 1, fin).join("\n");
      html.push(
        `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${cdataSeguro(codigo)}]]></ac:plain-text-body></ac:structured-macro>`,
      );
      i = fin + 1;
      continue;
    }

    const encabezado = linea.match(/^(#{1,6})\s+(.*)$/);
    if (encabezado) {
      cerrarLista();
      const nivel = encabezado[1].length;
      html.push(`<h${nivel}>${inlineAStorage(encabezado[2])}</h${nivel}>`);
      i += 1;
      continue;
    }

    const itemUl = linea.match(/^[-*]\s+(.*)$/);
    const itemOl = linea.match(/^\d+\.\s+(.*)$/);
    if (itemUl || itemOl) {
      const tipo = itemUl ? "ul" : "ol";
      const texto = itemUl ? itemUl[1] : itemOl[1];
      if (listaActual && listaActual !== tipo) cerrarLista();
      if (!listaActual) {
        html.push(`<${tipo}>`);
        listaActual = tipo;
      }
      html.push(`<li>${inlineAStorage(texto)}</li>`);
      i += 1;
      continue;
    }

    cerrarLista();

    if (linea.trim() === "") {
      i += 1;
      continue;
    }

    const parrafo = [linea];
    let j = i + 1;
    while (j < lineas.length && lineas[j].trim() !== "" && !/^(#{1,6})\s|^[-*]\s|^\d+\.\s|^```/.test(lineas[j])) {
      parrafo.push(lineas[j]);
      j += 1;
    }
    html.push(`<p>${inlineAStorage(parrafo.join(" "))}</p>`);
    i = j;
  }
  cerrarLista();
  return html.join("\n");
}

function inlineAMarkdown(html) {
  let s = html;
  s = s.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**");
  s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*");
  s = s.replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`");
  s = s.replace(/<br\s*\/?>/gi, " ");
  return unescapeHtml(s.replace(/<[^>]+>/g, ""));
}

/** Convierte formato storage de Confluence a Markdown. Pensado para contenido escrito por esta
 * integración o por el editor de Confluence usando bloques simples; no es un parser HTML genérico. */
export function storageAMarkdown(storage) {
  let texto = String(storage);
  const bloques = [];

  texto = texto.replace(
    /<ac:structured-macro ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)]]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    (_, codigo) => {
      bloques.push("```\n" + codigo.replace(/]]]]><!\[CDATA\[>/g, "]]>") + "\n```");
      return `\u0000${bloques.length - 1}\u0000`;
    },
  );

  texto = texto.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/gi, (_, nivel, contenido) => `\n${"#".repeat(Number(nivel))} ${inlineAMarkdown(contenido)}\n`);
  texto = texto.replace(/<ul>([\s\S]*?)<\/ul>/gi, (_, cuerpo) =>
    [...cuerpo.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m) => `- ${inlineAMarkdown(m[1])}`).join("\n"),
  );
  texto = texto.replace(/<ol>([\s\S]*?)<\/ol>/gi, (_, cuerpo) =>
    [...cuerpo.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map((m, idx) => `${idx + 1}. ${inlineAMarkdown(m[1])}`).join("\n"),
  );
  texto = texto.replace(/<p>([\s\S]*?)<\/p>/gi, (_, contenido) => `\n${inlineAMarkdown(contenido)}\n`);
  texto = texto.replace(/<[^>]+>/g, "");

  texto = texto.replace(/\u0000(\d+)\u0000/g, (_, idx) => `\n${bloques[Number(idx)]}\n`);

  return texto
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}
