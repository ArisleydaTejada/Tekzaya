---
version: 1
slug: "dashboard"
primary_target: "dashboard"
related_targets: ["login","shell"]
---

## Direction contract

THESIS: El tablero es un panel de vuelo personal: cuatro instrumentos que se leen de un vistazo y dos listas cortas para actuar. Nunca una sala de gráficas — esas viven en Reportes. Refusa la cuadrícula de charts en la pantalla de inicio.

OWN-WORLD (heredado del shell/login, con esta extensión): las 4 tarjetas KPI se dibujan como diales/placas de instrumento (arco de progreso donde aplica), no tarjetas planas; la variación vs. período anterior es una insignia junto al dial (verde si mejora, rojo si empeora, según si la métrica es "mejor cuanto más" o "cuanto menos"); la disponibilidad del equipo (vista de área/global) es una fila de luces verde/gris.

ESTRUCTURA (misma composición, datos según rol): encabezado con saludo y frase de atención · filtro de período (Día\|Semana\|Mes\|Año\|Rango) que solo afecta a los KPI.
- **Empleado:** 4 diales (Pendientes del área, Resueltos por mí, Pendientes para mí, Urgentes) · panel "Asignados a mí" (3 tickets, orden: respuesta nueva → SLA vencido/en riesgo → prioridad/antigüedad) · panel "Mis solicitudes" (5 tickets). Lado a lado; 2×2 y apilado en móvil.
- **Supervisor de área:** interruptor "Mi área \| Personal" (Personal = vista de empleado) · vista Mi área: 4 diales (Pendientes, Resueltos, T. 1.ª respuesta, Cumplimiento SLA/CSAT) · fila de disponibilidad del equipo · franja de aviso de incidente IA si aplica · enlace "Ver gráficas en Reportes".
- **Admin / RRHH:** selector de alcance (Todas las áreas \| Área \| Persona \| Yo) sobre la misma estructura; RRHH siempre de solo lectura (sin botones de asignar/reasignar).

ESTADOS: vacío "No tienes tickets asignados" + botón "Ver tickets de mi área"; vacío "Aún no has creado solicitudes" + botón "Crear mi primer ticket"; botón "Exportar ▾" (CSV/PDF) respetando el alcance.

FORM: Extiende el mundo de `login`/`shell`; sin sorteo de concepto — la composición (4 KPI + 2 paneles, sin gráficas) está fijada por la especificación §7.2.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
