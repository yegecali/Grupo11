# Integración de Jira con el OCD

La integración crea un ticket real en Jira Cloud a partir de una Issue `[OCD]` de GitHub. Las credenciales se guardan como secretos de Actions; nunca se ingresan en el chat, el navegador, una Issue ni el repositorio.

## Configuración inicial

En **Settings → Secrets and variables → Actions**, agrega estas variables:

| Nombre | Tipo | Valor |
|---|---|---|
| `JIRA_BASE_URL` | Variable | URL HTTPS de Jira Cloud, por ejemplo `https://empresa.atlassian.net` |
| `JIRA_PROJECT_KEY` | Variable | Clave del proyecto que recibirá los OCD |
| `JIRA_ISSUE_TYPE` | Variable | Nombre o ID del tipo de incidencia configurado en Jira |
| `JIRA_EMAIL` | Secreto | Correo de la cuenta técnica de Jira |
| `JIRA_API_TOKEN` | Secreto | Token API de esa cuenta técnica |

La cuenta técnica necesita permiso para crear incidencias en el proyecto. Jira debe aceptar el resumen, la descripción y las etiquetas estándar; si el proyecto exige campos adicionales, habrá que ampliar el mapeo de `scripts/jira-crear-ocd.mjs`.

## Crear un ticket

1. Completa y guarda una Issue `[OCD]` en GitHub.
2. Revisa el informe del agente y corrige los bloqueos que correspondan.
3. Comenta `/jira crear` en la Issue.
4. Actions crea el ticket y publica su enlace. Si la Issue ya tiene la marca de Jira, no crea un segundo ticket.

El ticket contiene el texto del formulario, el enlace a la Issue, los pasos de cada estado y los cuatro conjuntos de instrucciones requeridos para pasar a Revisiones técnicas. El flujo se toma de `knowledge/ocd-flujo.json`; la guía queda referenciada en `documentacion/06-ocd-pase-a-produccion.md` y `documentacion/13-flujo-ocd.md`.

El comando solo lo procesa una persona con asociación OWNER, MEMBER o COLLABORATOR en el repositorio y solo en Issues `[OCD]`. No acepta credenciales en el comentario. Jira Cloud usa la API REST v3 y formato Atlassian Document Format para la descripción.
