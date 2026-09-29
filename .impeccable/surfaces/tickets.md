---
version: 1
slug: "tickets"
primary_target: "tickets"
related_targets: ["login","shell"]
---

## Direction contract

THESIS: La lista de tickets es la torre de control diaria: se escanea por urgencia de SLA, no por orden de llegada, y se actúa sin salir de la fila.

OWN-WORLD (heredado): la barra/tiempo restante de SLA se dibuja como una mini-aguja de color (verde/ámbar/rojo) junto al texto, nunca solo color; avatares de responsables apilados con "+N" y tooltip; prioridad como barra de color + texto, siempre con la palabra visible (Urgente/Alta/Media/Baja), nunca solo el color.

ESTRUCTURA: pestañas con contador (Mis solicitudes \| Asignados a mí \| Mi área \| Sin asignar, + Todos para admin) · barra de herramientas (buscador, filtros de estado/prioridad/área/categoría/responsable/solicitante/SLA/fechas, selector de vista Lista\|Grupos\|Kanban, ordenar por, Exportar CSV). Las tres vistas comparten el mismo dato de fila/tarjeta.
- **Lista:** columnas de §7.3 (☐, ID, Título, Solicitante, Área/categoría, Prioridad, Responsables, Estado, T. respuesta, T. resolución, Creado); orden por defecto SLA vencido/en riesgo → prioridad → antigüedad; paginación 25 (50/100 configurable).
- **Grupos:** secciones plegables con contador, agrupadas por Estado (predeterminado), Prioridad, Responsable, Categoría o Área.
- **Kanban:** una columna por estado activo (Abierto·Asignado·En progreso·En espera·Resuelto); arrastrar y soltar cambia estado solo si la transición es válida y el usuario tiene permiso (si no, la tarjeta vuelve con aviso); soltar en En espera/Resuelto pide comentario (obligatorio en Resuelto).

ESTADOS: etiqueta "Solo lectura" en Mi área/Sin asignar para quien no es responsable; botón "Asignar" (supervisor) o "Tomar" (miembro del área) cuando no hay responsables; Kanban se desplaza horizontalmente en móvil.

FORM: Extiende el mundo de `login`/`shell`; sin sorteo de concepto — la topología (pestañas, columnas, tres vistas) está fijada por §7.3, inspirada en `ticket_lista.png` y `ticket_groups.webp` sin calcarlas.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
