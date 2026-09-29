# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Definido en `Tekzaya_Especificacion.md` §10: React + Vite + TypeScript, Tailwind CSS + shadcn/ui, Recharts, dnd-kit, Node/Express, MongoDB, Socket.IO, Gemini API. Ejecución local por ahora. Aún no existe código.

## Users

Empleados de pymes hispanohablantes (20 a 500 personas) sin mesa de ayuda formal. Todo empleado pertenece a un área y tiene dos facetas: solicitante (pide ayuda a cualquier área) y agente (atiende los tickets de la suya). Roles: empleado, supervisor de área, supervisor de RRHH (lectura global) y administrador. Cada rol ve un tablero y un alcance de datos distintos.

## Product Purpose

Reunir en un solo lugar el soporte interno por tickets y, en la Fase 2, el mantenimiento de activos, que hoy se dispersan entre correo, WhatsApp y hojas de cálculo. La IA (Gemini) clasifica área, categoría y prioridad, resume conversaciones, autocompleta respuestas con Tab y detecta incidentes; el sistema mide SLA y desempeño. La Fase 1 cubre solo tickets.

Éxito hoy: **demo y defensa académica** (asignatura Proyecto Emprendedor 2), con datos semilla realistas, concebida como producto real a futuro.

## Positioning

Interfaz moderna en español, IA integrada desde el primer ticket, y soporte más mantenimiento de activos en una sola herramienta a escala pyme. Los competidores caros (Jira Service Management, Zendesk, Freshdesk) son complejos y orientados a clientes externos; los gratuitos (GLPI, osTicket) tienen interfaz anticuada y no traen IA.

## Operating Context

Una sola empresa (instancia única), en español, web responsiva con escritorio como prioridad y funcional desde 360 px. El trabajo se mide en horario laboral (L-V, 08:00-18:00) con SLA por prioridad (Urgente, Alta, Media, Baja). Cualquier miembro de un área puede leer la conversación completa de los tickets de su área; el solicitante nunca ve las notas internas. La IA nunca bloquea el flujo: si falla, el ticket se crea igual.

## Capabilities and Constraints

- Fase 1: login (Google y correo), tableros sin gráficas (4 KPI + listas cortas), tickets en vista Lista, Grupos y Kanban, creación con área sugerida por IA (también en nombre de un compañero), detalle con conversación pública e interna, asignación a uno o varios responsables, disponibilidad, fusión de duplicados, Reportes personalizables, exportación CSV/PDF, notificaciones en tiempo real, encuesta CSAT y administración.
- Fuera de la Fase 1: mantenimiento de activos ("Próximamente" en el menú), correo, base de conocimientos, sugerencias de solución con IA, app móvil nativa, multiempresa, nube.
- Sin registro público: el administrador invita usuarios.
- Autorización siempre validada en el backend, no solo ocultada en la interfaz.
- Accesibilidad: contraste AA, teclado, y colores de prioridad siempre acompañados de texto.
- Pendiente de decidir: logo definitivo, promedio anónimo del área en reportes de empleados, compartir reportes guardados.

## Brand Commitments

Solo el nombre **Tekzaya** es fijo. La paleta índigo-violeta del spec (`#4F46E5` / `#7C3AED`) y el logotipo tipográfico "T" son un **punto de partida**, no compromisos vinculantes. El logo definitivo está pendiente. Las capturas de `ideas_diseno/` son **inspiración de estructura y funcionalidad, no un calco**.

## Evidence on Hand

- `Tekzaya_Especificacion.md` (v1.4): especificación detallada de Fase 1.
- `tekzaya.md`: documento original del proyecto.
- `ideas_diseno/`: capturas de referencia (dashboard, lista y grupos de tickets, conversación, crear ticket, barra de menú, reportes).
- No hay usuarios reales, clientes, testimonios, métricas de uso ni logo. No fabricar ninguno; los datos de demostración deben presentarse como datos semilla.

## Product Principles

1. **La IA asiste, la persona decide.** Sugiere área, prioridad, resumen y autocompletado, pero nunca fusiona, reasigna ni bloquea sin que una persona lo apruebe.
2. **Cada rol ve lo que necesita actuar, no todo lo que existe.** El tablero es una vista rápida de acciones; el análisis vive en Reportes.
3. **Transparencia dentro del área, privacidad hacia el solicitante.** Leer no implica actuar; las notas internas nunca llegan al solicitante.
4. **Crear un ticket toma menos de un minuto.** Cuatro campos; la IA decide categoría y prioridad después.
5. **Debe verse y funcionar como un producto real en la defensa.** Estados vacíos, errores y datos semilla creíbles cuentan tanto como el camino feliz.

## Accessibility & Inclusion

Contraste AA, navegación completa con teclado, etiquetas en formularios y mensajes de error claros en español. Prioridad y estado nunca se comunican solo con color.
