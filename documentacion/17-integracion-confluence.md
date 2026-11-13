# Integración con Confluence

Publica los documentos de `knowledge/` como páginas de Confluence, para que el equipo pueda leerlos
y, en el caso de los estándares (`knowledge/0*.md`), editarlos ahí y traerlos de vuelta por PR.

**El motor nunca lee Confluence.** `scripts/engine.mjs` y `scripts/flujo.mjs` solo leen los archivos
de `knowledge/` del repositorio (AGENTS.md, reglas 1, 5 y 6): sin esa condición, el agente dependería
de la red y de un token en cada ejecución, y los 64 tests de `npm test` dejarían de ser deterministas.
Confluence es un espejo de lectura y un lugar de edición humano; el repositorio decide.

## Qué sincroniza cada dirección

| Dirección | Qué mueve | Cómo se aplica |
|---|---|---|
| **Subir** (`knowledge/` → Confluence) | Todos los archivos: los `.md` como páginas editables, los `.json` como páginas de solo lectura (bloque de código con el JSON) | Directo, sin PR: es solo documentación derivada |
| **Traer** (Confluence → `knowledge/`) | Solo los estándares `.md` (`01-pase-a-produccion.md`, etc.) | Abre un Pull Request; nunca escribe en `main` directamente |

Los archivos JSON (`policy.json`, `ocd.json`, `ocd-flujo.json`, etc.) **no se traen de vuelta**: son
configuración estructurada y no tienen una representación confiable en el editor de Confluence. Se
siguen editando solo en el repositorio, como pide la regla 6 de AGENTS.md.

## Configuración inicial

En **Settings → Secrets and variables → Actions** del repositorio, entorno `kanban`:

| Nombre | Tipo | Valor |
|---|---|---|
| `CONFLUENCE_BASE_URL` | Variable | URL HTTPS del sitio, por ejemplo `https://empresa.atlassian.net/wiki` |
| `CONFLUENCE_SPACE_KEY` | Variable | Clave del espacio que recibirá las páginas |
| `CONFLUENCE_PARENT_PAGE_ID` | Variable (opcional) | ID de una página bajo la cual crear las páginas del KB |
| `CONFLUENCE_EMAIL` | Secreto | Correo de la cuenta técnica de Confluence |
| `CONFLUENCE_API_TOKEN` | Secreto | Token API de esa cuenta técnica (id.atlassian.com → Seguridad → Tokens de API) |

La cuenta técnica necesita permiso para crear y editar páginas en ese espacio.

## Usar la sincronización

- **Subir**: se ejecuta sola cuando se fusiona un cambio en `knowledge/**` a `main`, o manualmente
  con `Actions → confluence-sync → Run workflow` eligiendo `subir`.
- **Traer**: solo manual, `Actions → confluence-sync → Run workflow` eligiendo `traer`. Si hay
  cambios en las páginas `KB: 0*.md` de Confluence, el workflow abre un PR con el diff para que
  alguien lo revise y lo fusione como cualquier otro cambio en `knowledge/`.

El título de cada página sigue el patrón `KB: <archivo>` (o `KB: <archivo> (solo lectura)` para los
JSON); no cambies ese título en Confluence o la sincronización dejará de encontrar la página.

## Límites conocidos

La conversión Markdown ⇄ formato storage de Confluence (`scripts/confluence-formato.mjs`) cubre
encabezados, listas, negrita/cursiva, código en línea, bloques de código y enlaces: lo que usan hoy
los estándares de `knowledge/`. No soporta tablas, imágenes ni citas; si Confluence devuelve ese
formato, `confluence-pull.mjs` lo descarta al limpiar las etiquetas HTML. Revisa siempre el diff del
PR antes de aprobarlo.
