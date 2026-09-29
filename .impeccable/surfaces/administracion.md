---
version: 1
slug: "administracion"
primary_target: "administracion"
related_targets: ["login","shell"]
---

## Direction contract

THESIS: Administración es la sala de mantenimiento del panel: configura los instrumentos de todo lo demás, con la misma calma que el resto de la app, sin ceremonia añadida.

OWN-WORLD (heredado, en su registro más denso): tablas estándar densas priorizan la tarea sobre la expresión (Operate manda aquí); el único acento del mundo es el índigo en acciones primarias, y la invitación generada se presenta como una placa/recibo con el enlace para copiar.

ESTRUCTURA: tres secciones bajo "Administración" — **Usuarios** (tabla: nombre, correo, área, rol, supervisor sí/no, acceso global sí/no, estado, último acceso; acciones Invitar/Editar/Desactivar/Generar enlace de restablecimiento) · **Áreas y categorías** (CRUD de áreas con color y categorías por área, designar supervisores) · **Configuración** (SLA por prioridad, horario laboral y festivos, días de cierre automático, dominio corporativo para Google, activar/desactivar funciones de IA, límites de Reportes).

ESTADOS: al desactivar a alguien con tickets asignados, aviso de que quedan sin responsable y deben reasignarse; formulario de invitación sin envío de correo (se copia el enlace); validaciones inline en Configuración (por ejemplo, SLA de respuesta > SLA de resolución).

FORM: Extiende el mundo de `login`/`shell` en modo Operate denso; sin sorteo de concepto — las tres secciones y sus campos están fijados por §7.7.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
