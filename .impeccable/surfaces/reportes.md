---
version: 1
slug: "reportes"
primary_target: "reportes"
related_targets: ["login","shell","dashboard","tickets"]
---

## Direction contract

THESIS: Reportes es el banco de instrumentos completo: aquí viven todas las gráficas que el tablero deliberadamente no muestra, construidas a medida por quien pregunta.

OWN-WORLD (heredado): las tarjetas KPI se dibujan como diales, igual que en el tablero; las gráficas siguen la skill `dataviz` para paleta y tipos, heredando el índigo como acento de "serie propia/comparación" y el semáforo SLA donde la medida lo pida; el panel lateral de configuración de gráfica, con vista previa en vivo, se presenta como ajustar un instrumento antes de montarlo en el panel.

ESTRUCTURA: encabezado (título, subtítulo, selector de período Día\|Semana\|Mes\|Año\|Rango, selector de alcance según rol, botón Exportar ▾) · pestañas Mis reportes\|Plantillas\|Nuevo reporte · fila de hasta 4 KPI · cuadrícula de gráficas (1/3, 1/2 o ancho completo; arrastrable y redimensionable en modo edición) · botón "+ Añadir gráfica" (abre el panel de configuración de 9 pasos de §7.8.3) · barra de acciones del reporte (Guardar\|Guardar como\|Duplicar\|Eliminar\|Exportar) · sección "Tickets del período" (§7.8.9: tabla con todos los estados, filtros avanzados, selector de columnas), enlazada por un clic desde cualquier gráfica (filtra la lista por el valor clicado).

ESTADOS: vacío "Este reporte aún no tiene gráficas" con acceso a plantillas; vacío "No hay tickets en este período y alcance"; esqueleto de carga por gráfica (un fallo no bloquea las demás); combinación inválida de medida/dimensión/tipo deshabilitada con explicación en vez de error.

FORM: Extiende el mundo de `login`/`shell`; sin sorteo de concepto — la estructura, el catálogo de medidas/dimensiones y los tipos de gráfica están fijados por §7.8 (inspirado en `reports.png`/`reports2.png` sin calcarlos). La construcción de cada gráfica debe cargar y seguir la skill `dataviz` antes de escribir código de visualización.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
