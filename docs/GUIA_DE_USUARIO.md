# Tekzaya — Guía de usuario

Esta guía explica **qué es Tekzaya, cómo funciona y cómo se usa**, sin conocimientos técnicos. Está pensada para empleados, supervisores, personal de RRHH y administradores. Si lo que buscas es instalar la aplicación, eso está en el [`README.md`](../README.md).

> Los nombres, tickets, equipos y cifras que trae la versión de demostración son **datos inventados para probar**, no datos reales de ninguna empresa.

---

## Índice

1. [¿Qué es Tekzaya?](#1-qué-es-tekzaya)
2. [Palabras que conviene conocer](#2-palabras-que-conviene-conocer)
3. [Quién ve qué: los roles](#3-quién-ve-qué-los-roles)
4. [Entrar y moverse por la aplicación](#4-entrar-y-moverse-por-la-aplicación)
5. [Tickets: pedir ayuda y atenderla](#5-tickets-pedir-ayuda-y-atenderla)
6. [Los plazos de atención (SLA)](#6-los-plazos-de-atención-sla)
7. [Activos y mantenimiento](#7-activos-y-mantenimiento)
8. [Tablero y reportes](#8-tablero-y-reportes)
9. [La inteligencia artificial: qué hace y qué no](#9-la-inteligencia-artificial-qué-hace-y-qué-no)
10. [Notificaciones](#10-notificaciones)
11. [Tu perfil y tu disponibilidad](#11-tu-perfil-y-tu-disponibilidad)
12. [Administración](#12-administración)
13. [Seguridad y privacidad](#13-seguridad-y-privacidad)
14. [Preguntas frecuentes](#14-preguntas-frecuentes)
15. [Cómo está construido (para curiosos)](#15-cómo-está-construido-para-curiosos)

---

## 1. ¿Qué es Tekzaya?

Tekzaya es una aplicación web para que **los empleados de una empresa pidan ayuda a otras áreas y para cuidar los equipos de la empresa**. Reúne en un solo lugar lo que normalmente se pierde entre correos, mensajes de WhatsApp y hojas de cálculo.

Tiene **dos módulos** que trabajan juntos:

| Módulo | Para qué sirve | Ejemplo |
|---|---|---|
| **1. Tickets (soporte interno)** | Pedir ayuda a un área y que esa área la atienda dentro de un plazo. | "No me funciona el correo", "Necesito acceso a la carpeta de Ventas". |
| **2. Activos y mantenimiento** | Llevar el inventario de equipos, sus averías, reparaciones, repuestos y mantenimientos programados. | La impresora de Ventas, el aire acondicionado de la oficina, las laptops. |

Los dos se unen en un punto: si alguien reporta "la impresora no imprime" y elige esa impresora en el ticket, el técnico puede convertir esa queja en una **orden de trabajo** para repararla. Cuando la orden termina, el ticket se resuelve y la persona que reportó recibe el aviso.

Además, Tekzaya usa **inteligencia artificial** para ahorrar trabajo (sugerir a qué área va un problema, resumir conversaciones, ayudar a redactar…), pero **siempre decide una persona**.

---

## 2. Palabras que conviene conocer

| Palabra | Qué significa |
|---|---|
| **Ticket** | Una solicitud de ayuda. Tiene un número como `TK-000123`, un título, una descripción y una conversación. |
| **Área** | Un departamento de la empresa: TI, Mantenimiento, Ventas, RRHH… Cada persona pertenece a una. |
| **Solicitante** | La persona que necesita la ayuda. Normalmente es quien crea el ticket. |
| **Responsable** | La persona (o personas) del área que atiende el ticket. |
| **Supervisor** | Persona de un área con permisos extra: reparte el trabajo y ve las estadísticas del área. |
| **SLA** | El plazo máximo para responder y para resolver un ticket. Ver [sección 6](#6-los-plazos-de-atención-sla). |
| **Nota interna** | Un mensaje dentro del ticket que solo ve el área que lo atiende, nunca el solicitante. |
| **CSAT** | La calificación de 1 a 5 estrellas que da el solicitante al terminar. Mide la satisfacción. |
| **Activo** | Un equipo o bien de la empresa que hay que mantener. Tiene un número como `ACT-0012`. |
| **Área responsable** | El área que **mantiene** un activo. Por ejemplo, TI mantiene la impresora aunque esté en Ventas. |
| **Área que lo usa / persona a cargo** | Quién usa el equipo en el día a día. |
| **Orden de trabajo (OT)** | La tarea técnica de reparar o revisar un equipo. Tiene un número como `OT-0045`. |
| **Correctivo** | Reparar algo que se dañó. |
| **Preventivo** | Revisar algo periódicamente para que no se dañe (por ejemplo, limpiar el aire acondicionado cada 3 meses). |
| **Repuesto** | Una pieza del almacén que se usa en las reparaciones. Tiene un número como `REP-0003`. |
| **Stock mínimo** | La cantidad por debajo de la cual hay que reponer un repuesto. |
| **MTBF / MTTR / Disponibilidad** | Medidas de qué tan bien funciona un equipo. Ver [sección 8](#8-tablero-y-reportes). |

---

## 3. Quién ve qué: los roles

La regla de oro: **todo empleado pertenece a un área, y el área atiende lo que le llega**. Por eso una misma persona puede **pedir ayuda** a otras áreas y también **atender** los tickets de la suya.

| Rol | Qué puede hacer |
|---|---|
| **Empleado** | Crear tickets hacia cualquier área, seguir los suyos y atender los de su área (tomarlos, responder, resolver). Ve los equipos que usa su área o que tiene a su cargo, para poder reportar sus fallas. |
| **Supervisor de área** | Todo lo del empleado, y además: asignar tickets, cambiar prioridades, ver las estadísticas y reportes de su área. Si su área mantiene equipos, también gestiona el inventario, las órdenes de trabajo, los repuestos y los preventivos. |
| **Supervisor de RRHH** | Supervisor de su propia área **más una vista de solo lectura de todas las áreas**: estadísticas y reportes globales. No configura el sistema ni reparte trabajo de otras áreas. |
| **Administrador** | Control total: usuarios, áreas, categorías, plazos, horario laboral, funciones de IA y moneda. Ve todo. |

Algunas reglas que conviene recordar:

- **Dentro del área hay transparencia.** Cualquier miembro puede leer la conversación completa de los tickets de su área, aunque no sea responsable. Así se puede cubrir a un compañero.
- **El solicitante nunca ve las notas internas**, ni siquiera si pertenece al área que atiende.
- **El empleado nunca ve costos.** Ve "su" laptop y su estado, pero el precio de compra y lo que costaron las reparaciones son información del área que la mantiene.
- **Los permisos los comprueba el servidor**, no solo la pantalla. Aunque alguien manipulara la página, no podría ver lo que no le toca.

---

## 4. Entrar y moverse por la aplicación

### Iniciar sesión

Se entra con **correo y contraseña**, o con la cuenta de **Google** de la empresa (si el administrador lo activó). No hay registro libre: el administrador invita a cada persona con un enlace.

Por seguridad, tras **5 intentos fallidos** la cuenta se bloquea 15 minutos.

### La pantalla principal

- **Barra lateral (izquierda):** el menú. Se puede contraer para ganar espacio. Muestra cuántos tickets y órdenes tienes pendientes.
- **Barra superior:** la campana de notificaciones, el cambio de tema claro/oscuro y tu menú de perfil.
- **Pestañas:** cuando abres varios tickets u órdenes de trabajo, quedan como pestañas arriba, como en un navegador. Se pueden cerrar, reordenar arrastrándolas (o con `Alt + Shift + ←/→`), y el botón **+** abre un buscador que muestra primero lo que tienes asignado.

### El menú

| Opción | Quién la ve | Para qué |
|---|---|---|
| **Tablero** | Todos | Resumen rápido de tu día o de tu área. |
| **Tickets** | Todos | Bandeja de solicitudes. |
| **Activos y mantenimiento** | Todos | Inventario de equipos (cada uno ve los que le corresponden). |
| **Panel de mantenimiento** | Áreas que mantienen equipos, RRHH y admin | Números y alertas del mantenimiento. |
| **Órdenes de trabajo** | Ídem | Reparaciones y revisiones. |
| **Repuestos** | Ídem | Almacén de piezas. |
| **Preventivos** | Ídem | Planes de mantenimiento periódico y su calendario. |
| **Reportes** | Todos | Gráficas a medida y exportación. |
| **Administración** | Administrador (RRHH en lectura) | Configuración del sistema. |

La aplicación funciona en computadora y también en el teléfono (las tablas se convierten en tarjetas en pantallas pequeñas).

---

## 5. Tickets: pedir ayuda y atenderla

### 5.1 Crear un ticket (menos de un minuto)

Pulsa **"Nuevo ticket"**. El formulario es corto a propósito:

1. **Título:** resume el problema en una frase.
2. **Descripción:** cuenta qué pasa. Mientras escribes, la IA analiza el texto.
3. **Área de destino:** la IA sugiere a qué área va y la preselecciona si está bastante segura. Puedes cambiarla.
4. **Equipo afectado (opcional):** si el problema es de un equipo (tu laptop, la impresora), escríbelo y elígelo de la lista. Así el área técnica sabe exactamente qué revisar.
5. **Adjuntos (opcional):** capturas de pantalla o documentos, hasta 5 archivos de 10 MB.

**No hace falta elegir la prioridad ni la categoría:** la IA las propone después de enviar. Puedes corregir la categoría desde el ticket.

**Crear en nombre de un compañero:** si a un compañero de tu área se le dañó el equipo, puedes crear el ticket por él. Él recibirá los avisos como si lo hubiera creado.

Si cierras el formulario a medias, el texto se guarda como borrador en tu navegador para que no lo pierdas.

### 5.2 La bandeja de tickets

Hay tres formas de ver los tickets:

- **Lista:** una tabla con número, título, estado, prioridad, plazo, responsables… Se ordena y filtra.
- **Grupos:** los tickets agrupados (por estado, prioridad, etc.).
- **Kanban:** columnas por estado. Se cambia el estado **arrastrando la tarjeta** de una columna a otra (también con el teclado). Si el cambio no está permitido, el sistema lo rechaza.

El supervisor puede usar el **reparto automático**: el sistema propone a quién dar cada ticket sin responsable, priorizando a quien está disponible y con menos carga. Nada se aplica hasta que el supervisor confirma, y puede cambiar cualquier asignación antes.

### 5.3 Dentro de un ticket

- **La conversación:** mensajes públicos (los ve el solicitante) y **notas internas** (solo el área). Se pueden adjuntar archivos y mencionar a un compañero con `@` en las notas.
- **Enviar como…:** al responder se puede cambiar el estado en el mismo paso: *Enviar como En progreso*, *En espera* o *Resuelto*. Al resolver, la propia respuesta queda como nota de resolución, con sus adjuntos.
- **Resumen de IA:** un resumen corto de la conversación para ponerse al día.
- **Sugerir continuación:** la IA propone cómo seguir la respuesta. Se acepta con `Tab` y se descarta con `Esc` (también se pide con `Ctrl + Espacio`).
- **Acciones:** asignar responsables, poner en espera, resolver, **transferir a otra área** (si llegó al área equivocada), **fusionar duplicados** y, si hay un equipo vinculado, **convertir en orden de trabajo**.

### 5.4 Los estados de un ticket

```
Abierto → Asignado → En progreso → Resuelto → Cerrado
                          ↕
                      En espera
```

| Estado | Qué significa |
|---|---|
| **Abierto** | Recién creado, nadie lo ha tomado. |
| **Asignado** | Ya tiene responsable, pero aún no se empezó. |
| **En progreso** | Se está trabajando en él. |
| **En espera** | Se necesita algo del solicitante. **El reloj del plazo se detiene.** Si el solicitante responde, vuelve solo a "En progreso". |
| **Resuelto** | El área cree que el problema está solucionado. Se pide la calificación. |
| **Cerrado** | Final. El solicitante lo confirma o se cierra solo tras unos días hábiles en "Resuelto" (3 por defecto). |
| **Reabierto** | El solicitante dice que no se resolvió. Vuelve a los mismos responsables. Un ticket resuelto no vuelve a "En progreso" directamente: se reabre. |
| **Cancelado** | Se retiró la solicitud, con motivo. |
| **Fusionado** | Era un duplicado de otro ticket y se unió a él. El trabajo sigue en el principal. Se puede deshacer. |

### 5.5 Duplicados e incidentes

- **Fusionar:** si tres personas reportan lo mismo, se unen bajo un ticket principal. Todas reciben el aviso cuando se resuelve.
- **Incidentes:** si llegan **3 o más tickets parecidos** en poco tiempo (por ejemplo, "se cayó el wifi en Ventas"), la IA los agrupa y avisa al supervisor. Él decide si es un incidente o no.

### 5.6 Calificar la atención

Cuando tu ticket pasa a **Resuelto**, puedes calificar la atención de **1 a 5 estrellas**, con un comentario opcional. Una sola vez por ticket, hasta que se cierre.

---

## 6. Los plazos de atención (SLA)

Cada ticket tiene **dos relojes**: uno para la **primera respuesta** y otro para la **resolución**. El plazo depende de la prioridad:

| Prioridad | Cuándo se usa | Primera respuesta | Resolución |
|---|---|---|---|
| **Urgente** | Paraliza la operación o afecta a muchos. | 15 min | 4 h |
| **Alta** | Impide trabajar a alguien, sin alternativa. | 1 h | 8 h |
| **Media** | Molesta, pero hay una alternativa temporal. | 4 h | 24 h |
| **Baja** | Consultas y cosas planificables. | 8 h | 72 h |

Son los valores iniciales; el administrador los puede cambiar.

**Lo más importante: solo cuenta el horario laboral.** Por defecto, de lunes a viernes de 08:00 a 18:00, sin festivos. Un ticket creado el viernes a las 17:55 no vence el sábado, porque nadie trabaja.

> **Ejemplo:** un ticket de prioridad Media creado el **lunes a las 16:00** tiene 4 horas laborables para la primera respuesta. El lunes quedan 2 h (16:00–18:00); las otras 2 se cumplen el **martes a las 10:00**. Ese es el vencimiento.

Cada reloj pasa por tres estados, siempre con texto además de color:

- **En tiempo:** va bien.
- **En riesgo:** ya se consumió el 75 % del plazo. Se avisa a los responsables.
- **Vencido:** pasó el plazo. Se avisa a responsables y supervisores.

El tiempo **En espera** no cuenta en contra del área: mientras se espera al solicitante, el reloj está parado. Y cuando se da la primera respuesta o se resuelve, ese reloj se congela: un ticket respondido a tiempo nunca pasa luego a "vencido".

---

## 7. Activos y mantenimiento

### 7.1 La idea principal

Cada equipo tiene un **área responsable** que lo mantiene. La laptop de Diego la usa Ventas, pero la mantiene TI. Así se aprovechan las mismas áreas, supervisores y permisos de los tickets.

### 7.2 El inventario (Activos)

La lista muestra cada equipo con su **foto**, número, nombre, tipo, estado, quién lo usa, ubicación y garantía. A la derecha hay un resumen por estado (que también filtra) y filtros por tipo, área, ubicación y garantía. El filtro **"Área que lo usa"** solo aparece a quien ve equipos de varias áreas.

Estados de un equipo: **Operativo**, **En reparación** y **De baja**.

**La ficha de un equipo** reúne:

- Fotos (varias; la primera es la portada).
- Datos: marca, modelo, serie, ubicación, fecha y costo de compra, garantía, persona a cargo.
- **Estado actual**, con su disponibilidad de los últimos 30 días.
- **Línea de tiempo:** el historial completo, que solo crece: alta, mudanzas, cambios de responsable, fallas, reparaciones y baja.
- Sus órdenes de trabajo y tickets vinculados.

**Nada se borra:** un equipo se **da de baja** con su motivo, para no perder su historia. Un equipo con órdenes abiertas no se puede dar de baja.

### 7.3 De la queja a la reparación

1. Un empleado crea un ticket ("la impresora no imprime") y **vincula el equipo**.
2. El técnico del área responsable lo revisa y pulsa **"Convertir en orden de trabajo"**.
3. Se trabaja la orden: se cargan repuestos, servicios externos y notas.
4. Al **completar la orden**, el ticket se resuelve y el solicitante recibe el aviso.
5. La línea de tiempo del equipo registra la falla y la reparación.

Un ticket vinculado todavía no es una falla: la falla cuenta desde que existe la orden correctiva. Así, una queja que resulta no ser una avería no ensucia las estadísticas del equipo.

### 7.4 Órdenes de trabajo

Una orden de trabajo es la parte técnica del arreglo. Puede nacer de un ticket, de un **plan preventivo** o crearse directamente.

Estados: **Pendiente → Asignada → En progreso → En espera → Completada** (o **Cancelada**).

**El costo de una orden = repuestos usados + servicios externos** (un proveedor, por ejemplo). Las horas de los técnicos de la empresa no se cobran.

¿Por qué una orden y no el mismo ticket? Porque son cosas distintas: el ticket es la **conversación** con quien reportó; la orden es el **trabajo técnico** (piezas, proveedores, costo), y puede existir sin ningún ticket (un preventivo, por ejemplo).

### 7.5 Repuestos

El almacén de piezas: nombre, foto, existencias, mínimo, costo promedio y valor del inventario.

- Las existencias funcionan como un **libro de movimientos**: cada entrada, consumo o ajuste queda registrado.
- **Nunca puede haber stock negativo.** Si dos técnicos intentan usar la última pieza a la vez, solo uno lo consigue.
- Cuando un repuesto baja del **mínimo**, se marca **"Bajo mínimo"** y se avisa al supervisor.
- **El costo se congela al usarlo:** si mañana se compra la pieza más cara, el costo de una reparación de ayer no cambia.
- Un repuesto que ya no se usa se **desactiva**, no se borra.

### 7.6 Preventivos

Planes del tipo "revisar cada 3 meses", para un equipo concreto o para todos los equipos de un tipo. Un proceso automático diario **crea la orden de trabajo antes de la fecha**, con su lista de verificación. La pantalla muestra un **calendario mensual** y marca los planes vencidos.

### 7.7 Panel de mantenimiento

Un resumen para el área que mantiene equipos:

- **Cinco números:** órdenes abiertas, preventivos de la semana, preventivos vencidos, repuestos bajo mínimo y costo del mes.
- **Tres listas de alertas**, con la foto de cada equipo o repuesto:
  - **Garantías por vencer** en los próximos días.
  - **Fallas repetidas:** equipos con varias reparaciones en poco tiempo.
  - **Stock bajo:** repuestos por debajo del mínimo.

---

## 8. Tablero y reportes

### 8.1 El tablero

La primera pantalla. Cambia según el rol:

- **Empleado:** sus tickets pendientes, resueltos y urgentes.
- **Supervisor:** su área (resueltos por persona, tiempos de respuesta, solicitudes por tipo…), por día, semana, mes o año.
- **RRHH y administrador:** todas las áreas, un área, una persona o ellos mismos.

### 8.2 Reportes a medida

Es un **constructor de gráficas**: se eligen tres cosas y la gráfica aparece al momento.

1. **Qué medir:** tickets creados, resueltos, pendientes, tiempo de respuesta, tiempo de resolución, % de cumplimiento del plazo, satisfacción, tasa de reapertura, precisión de la IA… (más de 30 medidas).
2. **Cómo agrupar:** por fecha, categoría, prioridad, estado, área, responsable, solicitante…
3. **Qué gráfica:** número grande, barras, líneas, área, dona, radar, mapa de calor, tabla…

Además:

- **Comparar con el periodo anterior** ("este mes vs. el mes pasado").
- **Hacer clic en una barra** muestra los tickets que la forman.
- **Guardar** los reportes para volver a ellos.
- **Exportar** a CSV (para Excel) y la gráfica como imagen.
- Debajo, la **lista detallada** de los tickets (o de las órdenes de trabajo) del periodo, con filtros.
- Hay **plantillas** listas para empezar.

Cada uno solo puede reportar sobre lo que le corresponde: el empleado sobre sí mismo, el supervisor sobre su área, RRHH y el administrador sobre todo.

### 8.3 Reportes de mantenimiento

El constructor tiene una segunda fuente, **Mantenimiento**, con medidas propias:

| Medida | En palabras sencillas |
|---|---|
| **MTBF** (tiempo medio entre fallas) | Cuántas horas funciona un equipo, en promedio, antes de volver a fallar. **Más es mejor.** |
| **MTTR** (tiempo medio de reparación) | Cuánto se tarda, en promedio, en reparar una falla. **Menos es mejor.** |
| **Disponibilidad** | Qué porcentaje del tiempo estuvo el equipo funcionando. |
| **Costo** | Lo gastado en repuestos y servicios externos, por equipo, tipo o área. |
| **Cumplimiento de preventivos** | Qué parte de los mantenimientos programados se hicieron a tiempo. |

Igual que los plazos de los tickets, **se miden en horas laborables**: una impresora que falla el viernes a las 18:00 y vuelve a funcionar el lunes a las 9:00 estuvo parada 1 hora laboral, no 63.

---

## 9. La inteligencia artificial: qué hace y qué no

Tekzaya usa **Gemini**, de Google. Lo que hace:

1. **Sugerir área y categoría** al crear un ticket.
2. **Proponer la prioridad.**
3. **Resumir** la conversación de un ticket.
4. **Sugerir cómo continuar** una respuesta.
5. **Detectar incidentes** (varios tickets del mismo problema).
6. **¿Reparar o reemplazar?** En la ficha de un equipo que falla mucho o cuyas reparaciones ya son caras, explica si conviene reemplazarlo.
7. **Estimar el costo de una reparación**, a partir de reparaciones parecidas del pasado.

Lo que **no** hace:

- **No decide.** Solo sugiere; una persona confirma o corrige. Las correcciones sirven para medir qué tan acertada es la IA.
- **No se inventa cifras.** Quién es candidato a reemplazo lo decide una regla fija (fallas repetidas, o reparaciones que ya suman la mitad del precio de compra). La IA solo redacta la explicación, y si menciona un número que no estaba en los datos, la explicación se descarta. La estimación de costo sale de órdenes **reales** pasadas, enlazadas una por una; con menos de 3 casos parecidos, no se muestra estimación.
- **No detiene el trabajo.** Si la IA falla, tarda o no está activada, todo sigue funcionando: simplemente se elige el área a mano.

El administrador puede **apagar cada función** por separado.

---

## 10. Notificaciones

La **campana** de arriba avisa **al instante**, sin recargar la página. Algunos ejemplos:

| Cuándo | Quién se entera |
|---|---|
| Llega un ticket nuevo al área | Supervisores (y todo el área disponible si es Urgente). |
| Te asignan un ticket u orden | Tú. |
| Hay una respuesta nueva | El solicitante o los responsables, según quién escribió. |
| Te mencionan con `@` en una nota | Tú. |
| Tu ticket queda **En espera** | Tú: "Necesitamos tu respuesta". |
| Un plazo está **en riesgo** o **vencido** | Responsables (y supervisores si venció). |
| Tu ticket se resuelve | Tú, con la invitación a calificar. |
| Se detecta un posible incidente | Supervisores del área. |
| Una garantía vence pronto o un equipo falla repetidamente | El área que mantiene el equipo. |
| Un repuesto queda bajo mínimo | Supervisores del área dueña del almacén. |

---

## 11. Tu perfil y tu disponibilidad

Desde tu menú de perfil puedes cambiar tu foto y tu contraseña, y marcarte como:

- **Disponible:** recibes asignaciones con normalidad.
- **Ausente** (vacaciones, permiso, incapacidad), con fecha de regreso opcional. Mientras tanto no se te sugiere para asignaciones ni recibes el aviso masivo de urgentes, y apareces con un punto gris. Al llegar la fecha, vuelves a "Disponible" automáticamente.

Tus tickets actuales **no** se reasignan solos: tu supervisor recibe un aviso para decidir. El supervisor también puede marcar como ausente a alguien de su área.

---

## 12. Administración

Solo para el administrador (RRHH puede consultarla en modo lectura):

- **Usuarios:** invitar (se genera un enlace para compartir), editar, desactivar (no se borra, para conservar el historial) y generar enlaces para restablecer la contraseña.
- **Áreas y categorías:** crearlas, editarlas y designar supervisores.
- **Configuración:**
  - Plazos (SLA) por prioridad.
  - Horario laboral, zona horaria y días festivos.
  - Días para el cierre automático de tickets resueltos y en espera.
  - Dominio de la empresa permitido para entrar con Google.
  - Activar o desactivar cada función de IA.
  - Límites de reportes guardados.
  - Moneda y umbrales de mantenimiento (días de aviso de garantía, regla de fallas repetidas).

---

## 13. Seguridad y privacidad

- **Contraseñas guardadas de forma segura:** nunca se almacenan tal cual, sino cifradas de forma irreversible.
- **Sesión protegida:** la sesión vive en una cookie especial que la página no puede leer, lo que dificulta robarla. Caduca sola.
- **Bloqueo por intentos:** tras 5 contraseñas incorrectas, la cuenta espera 15 minutos.
- **Cada consulta se filtra en el servidor** según quién eres: un supervisor no puede ver otra área ni pidiéndolo a mano.
- **Los adjuntos y fotos** solo los descarga quien tiene permiso para ver el ticket, el equipo o el repuesto.
- **La IA trata lo que escribes como datos**, no como órdenes, para que nadie pueda "engañarla" con el texto de un ticket.
- **Nada importante se borra:** equipos, repuestos, usuarios y órdenes se desactivan o cancelan, y todo deja rastro en su historial.

---

## 14. Preguntas frecuentes

**¿Qué pasa si elijo el área equivocada?**
El área que lo recibe puede **transferirlo** a la correcta. El ticket vuelve a "Abierto" en la nueva área y queda registrado.

**¿Por qué mi ticket "Urgente" no venció el fin de semana?**
Porque los plazos solo cuentan en horario laboral, también para los urgentes.

**¿Puedo ver lo que el técnico escribe sobre mi ticket?**
Ves todos los mensajes públicos. Las notas internas son solo para el área que lo atiende.

**¿Por qué no veo cuánto costó reparar mi laptop?**
Los costos son información del área que mantiene el equipo. Tú ves el equipo y su estado para poder reportar fallas.

**¿Por qué no veo "Órdenes de trabajo" ni "Repuestos" en el menú?**
Solo los ven las áreas que mantienen equipos, RRHH y el administrador.

**¿Qué pasa si la IA no está disponible?**
Nada grave: eliges el área a mano y la prioridad queda en *Media* hasta que alguien la ajuste. Todo lo demás funciona igual.

**¿Se puede deshacer una fusión de tickets?**
Sí. El ticket fusionado vuelve a estar abierto.

**¿Puedo usar Tekzaya desde el teléfono?**
Sí, desde el navegador. Las pantallas se adaptan a pantallas pequeñas.

**¿Se puede navegar sin ratón?**
Sí. La aplicación se maneja con teclado (incluido el Kanban) y cumple las pautas de contraste para personas con baja visión. La prioridad y el estado nunca se indican solo con color.

---

## 15. Cómo está construido (para curiosos)

Esta sección resume la parte técnica en lenguaje sencillo. El detalle completo está en [`Tekzaya_Especificacion.md`](Tekzaya_Especificacion.md) y [`PRESENTACION.md`](PRESENTACION.md).

**Las piezas**

```
 Navegador (lo que ves)  ──►  Servidor (las reglas)  ──►  Base de datos (lo guardado)
        React                     Node.js + Express              MongoDB
           ▲                            │
           └──── avisos al instante ────┘   (Socket.IO)
                                        │
                                        └──►  Gemini (IA de Google), opcional
```

| Pieza | Qué hace | Analogía |
|---|---|---|
| **La web** (`apps/web`) | Lo que se ve y se toca: pantallas, botones, gráficas. | El mostrador de una tienda. |
| **El servidor** (`apps/api`) | Recibe cada petición, comprueba quién eres y qué puedes hacer, y responde. | El empleado que atiende y conoce las normas. |
| **La base de datos** (MongoDB) | Guarda usuarios, tickets, equipos, órdenes, repuestos… | El archivo de la tienda. |
| **Código compartido** (`packages/shared`) | Las reglas comunes: permisos, validaciones y el cálculo de plazos. La web y el servidor usan exactamente las mismas, para que nunca se contradigan. | El reglamento que tienen todos. |
| **Avisos en tiempo real** (Socket.IO) | Un canal siempre abierto para que las notificaciones lleguen sin recargar. | Un intercomunicador. |
| **Tareas automáticas** | Procesos que corren solos: revisar plazos cada 10 minutos, cerrar tickets resueltos, crear las órdenes de los preventivos, devolver a "Disponible" a quien vuelve de vacaciones, revisar garantías y stock. | Un despertador con recordatorios. |
| **IA** (Gemini) | Las sugerencias de la [sección 9](#9-la-inteligencia-artificial-qué-hace-y-qué-no). Opcional. | Un asistente que propone, no manda. |

**Cómo se comprueba que funciona**

- **Pruebas automáticas** del servidor y de las reglas compartidas: cada permiso tiene su prueba.
- **Recorridos completos** en un navegador automático: crear un ticket, atenderlo, convertirlo en orden, completarla… tal como lo haría una persona. También revisan la accesibilidad en tema claro y oscuro.
- **Pruebas de carga:** con 10 000 tickets, 1 000 equipos y 10 000 órdenes, cada pantalla responde en menos de 2 segundos (los reportes de mantenimiento, en menos de 3).

**Detalles de diseño que evitan errores**

- **Los montos se guardan en centavos enteros**, porque las computadoras se equivocan al sumar decimales (0,1 + 0,2 no da exactamente 0,3).
- **Las fechas de vencimiento se calculan una vez** al crear el ticket, y luego solo se comparan con la hora actual. Por eso las listas son rápidas aunque haya miles de tickets.
- **Una sola zona horaria de la empresa** para los plazos, para que un ticket no venza a horas distintas según quién lo mire. La zona de cada persona solo se usa para mostrar las fechas.
