# Plan de desarrollo — Módulo 2: Mantenimiento de activos

> **Base documental:** `Tekzaya_Especificacion.md` §14 (visión de la Fase 2), `PLAN_DESARROLLO.md` (módulo 1), `tekzaya.md`.
> **Punto de partida:** el módulo 1 (tickets) está completo y en producción de demo: auth, permisos, SLA, IA, tiempo real, reportes.
> **Calendario:** ~8 semanas a un frente. Si se acorta, ver [§7 Plan B](#7-plan-b-orden-de-recorte).

**Decisiones tomadas antes de empezar:**

| Decisión | Elegido | Por qué |
|---|---|---|
| Quién mantiene los activos | **Cada activo tiene un área responsable** (TI mantiene laptops e impresoras, Mantenimiento el aire acondicionado y el mobiliario) | Reutiliza el modelo de áreas, supervisores y permisos del módulo 1 sin inventar roles nuevos |
| Orden de trabajo vs. ticket | **Entidad aparte (`OT-0001`), vinculada al ticket** | La orden tiene su propio ciclo (horas, repuestos, costo) y puede nacer de un preventivo sin ningún ticket |
| Moneda | **Configurable por el admin, dólares (`USD`) por defecto** | Una sola moneda para todo el sistema; los montos no se convierten |

---

## 0. Cómo leer este plan

Igual que el módulo 1: cada fase se define por lo que **retira de riesgo** y termina cuando cumple su *Definición de listo* (DoD). Las fases se llaman **A0…A7** (de *Activos*) para no confundirlas con las F0…F8 del módulo 1.

La diferencia con el módulo 1 es que aquí **no hay prototipo de interfaz previo**: cada fase construye pantalla, API y datos a la vez (rebanada vertical), usando los componentes y tokens de diseño que ya existen.

---

## 1. Qué se reutiliza del módulo 1

Lo que ya está hecho y este módulo **no** vuelve a construir:

| Pieza existente | Uso en el módulo 2 |
|---|---|
| Áreas, supervisores, `hasGlobalReadAccess` | El área responsable de un activo decide quién lo ve y lo gestiona |
| Motor de permisos (`shared/permissions`) | Se amplía con las reglas de activos, órdenes y repuestos |
| Motor de horario laboral (`shared/sla/businessTime`) | MTTR y disponibilidad se miden en horas laborables, igual que el SLA |
| `counters` atómico | Se generaliza para `ACT-0001`, `OT-0001`, `REP-0001` |
| Adjuntos (tipo real por bytes, endpoint protegido) | Foto del activo, facturas, manuales |
| Notificaciones + Socket.IO (salas de usuario y área) | Avisos de preventivos, stock bajo, garantías |
| `node-cron` con funciones puras que reciben la hora | Generación de preventivos y alertas diarias |
| `AiProvider` con degradación sin clave | Fallas recurrentes y estimación de costo |
| Constructor de reportes (catálogo en `shared` + `validateWidget`) | Se añade una segunda fuente de datos: mantenimiento |
| Exportación CSV desde el servidor | Inventario, órdenes y movimientos de stock |

---

## 2. Modelo de datos

### 2.1 Colecciones nuevas

| Colección | Qué guarda | Campos clave |
|---|---|---|
| `assets` | La ficha de cada equipo | `number` (ACT-0001), `name`, `type`, `brand`, `model`, `serial`, `areaId` (**área responsable**, quien lo mantiene), `usedByAreaId` (área que lo usa), `custodianId` (persona a cargo, opcional), `location`, `purchaseDate`, `purchaseCost`, `warrantyUntil`, `status` (`operational` · `in_repair` · `retired`), `photoId` |
| `asset_events` | Historial **solo de inserción** de cada activo | `assetId`, `kind` (`created`, `status_changed`, `failure`, `repair`, `preventive`, `moved`, `custodian_changed`, `retired`), `at`, `actorId`, `workOrderId?`, `ticketId?`, `data` |
| `work_orders` | Órdenes de trabajo | `number` (OT-0001), `type` (`corrective` · `preventive`), `assetId`, `areaId`, `ticketId?`, `planId?`, `status`, `assigneeIds`, `scheduledFor?`, `timeEntries[]`, `partsUsed[]`, `externalCosts[]`, `costTotal`, `completionNotes` |
| `maintenance_plans` | Planes preventivos recurrentes | `assetId` (o `assetType` + `areaId` para un plan por tipo), `title`, `checklist[]`, `every` + `unit` (días/semanas/meses), `mode` (`fixed` · `from_last`), `nextDueAt`, `leadDays`, `isActive` |
| `spare_parts` | Catálogo de repuestos por área | `number` (REP-0001), `name`, `areaId`, `unit`, `stock`, `minStock`, `avgUnitCost` |
| `stock_movements` | Libro de movimientos de repuestos | `partId`, `kind` (`in` · `consume` · `return` · `adjust`), `qty`, `unitCost`, `workOrderId?`, `actorId`, `at`, `reason` |

### 2.2 Cambios en lo existente

- **`tickets`**: campo opcional `assetId` y `workOrderIds[]`.
- **`settings`**: bloque `maintenance` → `currency` (código ISO 4217, por defecto `"USD"`), `laborRates` (tarifa por hora **por área**), `warrantyAlertDays` (30), `repeatedFailure` (`{ count: 3, windowDays: 90 }`), `preventiveLeadDays` (7).
- **`counters`**: `nextTicketNumber()` pasa a ser `nextNumber("ticket" | "asset" | "work_order" | "spare_part")`.
- **`notifications`**: tipos nuevos `work_order_assigned`, `preventive_due`, `preventive_overdue`, `low_stock`, `warranty_expiring`, `repeated_failures`.

### 2.3 Decisiones del modelo

- **Los montos se guardan en centavos (enteros)**, nunca como decimales. `0.1 + 0.2` no da `0.3` en JavaScript, y un costo acumulado que se desvía un centavo es la clase de error que nadie ve hasta que alguien cuadra una factura.
- **Cambiar la moneda no convierte nada.** Si el admin pasa de USD a Bs, los montos antiguos quedan con la etiqueta nueva. La pantalla de Configuración lo avisa antes de guardar; convertir exigiría tipos de cambio históricos, que están fuera de alcance.
- **El historial es una colección de eventos que solo crece**, como el `statusHistory` de los tickets. La línea de tiempo del activo y las métricas (MTBF, disponibilidad) se derivan de ella. El estado actual vive en el activo para que la lista sea rápida, pero la verdad está en los eventos.
- **El stock es un libro de movimientos**, y el campo `stock` es su suma en caché. Se descuenta con una operación atómica condicionada (`$inc` solo si `stock >= qty`), así dos técnicos que consumen el último filtro a la vez no dejan el stock en `-1`.
- **El costo de un repuesto se congela al consumirlo.** El costo unitario es el promedio ponderado de las entradas; cuando una OT usa la pieza, guarda el costo de ese momento. Una compra posterior más cara no cambia lo que costó una reparación del mes pasado.
- **Nada se borra.** Un activo se da *de baja* (con motivo y fecha), un repuesto se desactiva, una OT se cancela. Igual que personas y áreas en el módulo 1.

---

## 3. Permisos

Se extiende la matriz de `shared/permissions` con la misma lógica de "área responsable":

| Acción | Empleado | Técnico del área responsable | Supervisor del área responsable | RRHH (lectura global) | Admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver los activos que tiene a su cargo o que usa su área | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ver inventario completo del área, historial y costos | — | ✓ | ✓ | ✓ (solo lectura) | ✓ |
| Crear, editar, mover, dar de baja un activo | — | — | ✓ | — | ✓ |
| Vincular un activo a un ticket | ✓ (al crear el suyo) | ✓ | ✓ | — | ✓ |
| Convertir un ticket en OT | — | ✓ | ✓ | — | ✓ |
| Tomar una OT, registrar horas y repuestos | — | ✓ | ✓ | — | ✓ |
| Asignar OT a otros | — | — | ✓ | — | ✓ |
| Gestionar planes preventivos | — | — | ✓ | — | ✓ |
| Entradas y ajustes de stock | — | — | ✓ | — | ✓ |
| Tarifas, moneda y umbrales | — | — | — | — | ✓ |

**El empleado nunca ve costos.** Ve "su" laptop y su estado para poder reportar una falla; el precio de compra y las reparaciones son información del área.

Igual que en el módulo 1: **cada fila tiene su prueba**, y el alcance de cualquier consulta lo decide el servidor desde la sesión.

---

## 4. Fases

### A0 · Contratos, modelo y semilla — *0,5 semanas*

**Objetivo:** que el modelo exista, tenga datos creíbles y el contrato sea compartido.

- Esquemas Zod en `packages/shared/src/maintenance/` (activo, evento, OT, plan, repuesto, movimiento) y enumerados con etiquetas en español.
- Modelos Mongoose con índices: `assets {areaId, status}`, `assets {custodianId}`, `work_orders {areaId, status}`, `work_orders {assetId, createdAt}`, `stock_movements {partId, at}`, `maintenance_plans {isActive, nextDueAt}`.
- `nextNumber()` genérico; `settings.maintenance` con sus valores por defecto (USD).
- Matriz de permisos ampliada **con sus pruebas** antes de cualquier endpoint.
- **Semilla:** ~60 activos entre TI y Mantenimiento, **12 meses de historial** (sin él, MTBF y disponibilidad salen vacíos), ~150 OT, 25 repuestos con dos bajo mínimo, 8 planes preventivos (uno vencido) y **un activo con fallas repetidas** para la demo de IA.

**DoD:** `npm run seed` crea el módulo 2 sin tocar los datos del módulo 1; las pruebas de permisos nuevas están en verde.

**Decisiones tomadas al ejecutar A0** (2026-10-17):

- **Índice único de preventivos: `{planId, assetId, scheduledFor}`**, no `{planId, scheduledFor}`. Un plan por tipo ("todas las impresoras de TI") genera una OT por equipo en la misma fecha; con el índice original, la segunda impresora chocaba con la primera. Sigue impidiendo dos OT del mismo plan, equipo y fecha.
- **"Tomar una OT" y "registrar horas y repuestos" son dos permisos.** Cualquier técnico del área la toma (`canTakeWorkOrder`); cargarle horas, repuestos y costos es de quien la atiende o de su supervisor (`canWorkOnWorkOrder`), igual que cambiar el estado de un ticket.
- **Vincular un equipo a un ticket** exige que el ticket sea propio o del área del técnico: un técnico de IT no vincula equipos en tickets de Mantenimiento.
- **La tarifa se congela en cada registro de horas** (`timeEntries[].rate`), igual que el costo del repuesto al consumirlo. Cambiar la tarifa del área no reescribe lo que costaron órdenes pasadas.
- **El tipo de activo es una lista cerrada** (`ASSET_TYPES`), no texto libre: es dimensión de los reportes y criterio de los planes por tipo.
- **Los montos se redondean una sola vez**: la mano de obra se suma en "centavos × minutos" y se divide al final.
- **La semilla del módulo 2 es aparte** (`apps/api/src/seed/maintenance.ts`), con su propio generador aleatorio, y corre al final de `npm run seed`: los tickets salen idénticos con o sin ella. `npm run seed:maintenance --workspace @tekzaya/api` la vuelve a sembrar sobre una base en uso sin tocar áreas, personas ni tickets. `seed:refresh` también adelanta sus fechas, incluidas las de calendario (garantías, fechas programadas).
- **La semilla se valida con una prueba** (`seed/maintenance.test.ts`): contrato Zod, stock igual a la suma de movimientos y nunca negativo, costo de cada OT, nada en el futuro, estado del activo igual a su historial, y el módulo 1 intacto. Encontró dos errores de la propia semilla antes de que llegaran a la demo.
- Resultado: 58 activos (2 de baja), ~170 OT, 25 repuestos (2 bajo mínimo), 8 planes (1 vencido), y la multifuncional de Ventas con 3 correctivas en 90 días y reparaciones por encima de su precio de compra.

---

### A1 · Inventario de activos — *1 semana*

**Objetivo:** la primera pantalla real del módulo.

`GET /assets` (filtros: área, tipo, estado, ubicación, persona a cargo, garantía; búsqueda; paginación), `POST /assets`, `GET /assets/:id`, `PATCH /assets/:id`, `POST /assets/:id/retire`, `GET /assets/:id/events`, `GET /assets/export`.

Frontend:
- Se habilita **"Activos y mantenimiento"** en la barra lateral (hoy dice *Próximamente*).
- **Lista** con filtros y **ficha** del activo: datos, foto, garantía (con aviso si vence pronto), persona a cargo y la **línea de tiempo** del historial.
- Formulario de alta y edición.

**DoD:** el supervisor de TI crea un activo con foto, lo mueve de ubicación y lo da de baja, y los tres pasos aparecen en la línea de tiempo; un empleado de Ventas solo ve los equipos que usa su área o tiene a su cargo, y **no** ve precios.

**Decisiones tomadas al ejecutar A1** (2026-10-17):

- **Mover es editar.** No hay un endpoint aparte: cambiar la ubicación, el área que lo usa o el área responsable en `PATCH /assets/:id` deja un paso `moved`, y cambiar la persona a cargo deja `custodian_changed`. El resto de los datos (nombre, serie, garantía) se corrige sin dejar rastro en la historia del equipo. Los campos opcionales aceptan `null` para vaciarlos.
- **Pasar un equipo a otra área responsable** exige supervisar las dos: es entregárselo.
- **No se da de baja con órdenes abiertas** (409); primero se cierran o cancelan. La baja pausa los planes preventivos del equipo, que A5 pedía.
- **El historial es del área**: el empleado ve la ficha de su equipo (sin costo de compra, que el servidor no envía) y en lugar de la línea de tiempo, un botón para reportar la falla con un ticket. `GET /assets/:id/events` le responde 403.
- **Lo que no se puede ver responde 404**, igual que un ticket ajeno.
- **La foto es un adjunto normal** que se enlaza al activo (`attachments.assetId`). Solo vale una imagen que subió quien guarda y que no está en un ticket ni en otro equipo; la ve quien puede ver el equipo.
- **"Persona a cargo"** necesita gente de otras áreas (la laptop de alguien de Ventas la da de alta IT), así que hay un `GET /assets/people` solo para quien gestiona activos, con nombre y área y nada más; `/areas/:id/members` no se amplió.
- **La lista trae `statusCounts`** con los demás filtros aplicados, para el resumen por estado del panel lateral (referencia `docs/ideas_diseno/maintenance.png`), que también filtra.
- **La línea de tiempo pliega los cambios de estado de una OT** en su falla ("quedó fuera de servicio") y su reparación ("vuelve a estar operativo"): una avería pasa de cuatro líneas a dos.
- **Los dados de baja se distinguen por fondo y etiqueta, no atenuando el texto**: la auditoría de axe marcó que `opacity-60` bajaba del contraste AA.
- Pruebas: 10 de API (`assets.test.ts`), el recorrido E2E `07-activos.spec.ts` y las dos páginas nuevas en la auditoría de accesibilidad (ambos temas y 360 px).

---

### A2 · Averías e integración con tickets — *1 semana*

**Objetivo:** unir los dos módulos. Este es el diferenciador del producto ("soporte + mantenimiento en una sola herramienta").

- **Campo "Activo afectado"** en *Crear ticket*: un enlace discreto **"Vincular un equipo"**, igual que *"Crear en nombre de un compañero"*. El formulario sigue teniendo 4 campos para quien no lo usa (regla de simplicidad del spec).
- El selector ofrece primero **los equipos a cargo de la persona** y luego los de su área.
- Si el activo pertenece a un área distinta de la elegida, se sugiere esa área (el área responsable de una impresora es TI, aunque esté en Ventas).
- En el detalle del ticket: tarjeta del activo con su estado y sus últimas averías, y botón **"Convertir en orden de trabajo"**.
- `PATCH /tickets/:id/asset`, `POST /tickets/:id/work-order`.

Decisiones:
- **Un ticket vinculado no es todavía una falla.** "Mi laptop va lenta" puede no ser una avería. La falla se registra cuando un técnico crea la OT correctiva. Así, MTBF no se infla con quejas que no eran fallas.
- **El ticket conserva su SLA y su conversación.** La OT es la trastienda técnica; el solicitante sigue hablando en el ticket. Al completar la OT se publica un mensaje de sistema en el ticket y se **sugiere** resolverlo, pero no se resuelve solo, porque resolver exige una nota de solución para el solicitante (decisión de F3).

**DoD:** crear ticket con activo → convertir en OT → la falla aparece en la línea de tiempo del activo y la OT enlaza al ticket y viceversa.

**Decisiones tomadas al ejecutar A2** (2026-10-18):

- **El selector es `GET /assets/link-options`** (con `ticketId` opcional) y devuelve solo lo que el servidor aceptará: es `canLinkAssetToTicket` escrita como consulta. Agrupa para la persona que reporta: *a su cargo*, *los que usa su área* y *otros que mantiene tu área*. Los dados de baja no salen.
- **Elegir el equipo rellena el área si está vacía; si ya hay otra, solo la sugiere** con un botón ("Enviar el ticket a IT y Sistemas"). "Reportar una falla" en la ficha del activo abre el formulario con `?activo=ACT-0012` y el equipo ya elegido.
- **El equipo no se cambia ni se quita una vez abierta una OT** (409): la falla ya quedó en su historia. Tampoco en un ticket terminado (resuelto, cerrado, cancelado o fusionado). Quitar o cambiar exige poder vincular el actual: el solicitante no quita el equipo que señaló IT.
- **Convertir es del área que mantiene el equipo, y hay una sola OT abierta por ticket.** Si el ticket está en otra área, la tarjeta explica que hay que transferirlo en vez de esconder el botón sin más. La OT nace *Pendiente* y sin responsables: tomarla y asignarla es A3.
- **Dos clics a la vez abren una sola OT**: el hueco se reserva en el ticket con un `$push` condicionado al tamaño de `workOrderIds` antes de crear la orden (hay prueba).
- **"¿Queda fuera de servicio?" no trae respuesta marcada**: un "sí" por defecto inflaría la parada en los reportes. Si el equipo ya estaba *En reparación* por otra OT, no se escribe un segundo cambio de estado (la actualización va condicionada a `status: "operational"`); `outOfService` guarda la respuesta tal cual. **Pendiente para A3:** completar una OT solo devuelve el equipo a *Operativo* si no queda otra abierta fuera de servicio.
- **La falla y su cambio de estado llevan `ticketId`**, y la línea de tiempo muestra "desde TK-…": así la OT enlaza al ticket y el ticket a la OT. El ticket recibe los mensajes de sistema `asset_linked`, `asset_unlinked` y `work_order_created`, que el solicitante ve: saber que se abrió una orden no expone nada del área.
- **El solicitante ve el equipo vinculado y su estado** aunque lo haya señalado un técnico y no pueda abrir su ficha (`canOpen`). Las últimas averías solo viajan a quien ve el historial del equipo, y las OT, a quien puede verlas.
- El mensaje en el ticket al completar la OT y la sugerencia de resolver pasan a A3, que es donde se completa.
- Pruebas: 11 de API (`ticketLink.test.ts`, con la de concurrencia), las del permiso del selector, el recorrido E2E `08-averias.spec.ts` y dos pantallas más en la auditoría de accesibilidad (selector y tarjeta del equipo, ambos temas).

---

### A3 · Órdenes de trabajo — *1,5 semanas*

**Objetivo:** el trabajo técnico con su costo real.

Estados: `Pendiente → Asignada → En progreso → En espera (repuesto/proveedor) → Completada`, más `Cancelada`. Transiciones validadas en el servidor (409 si no se permiten), como en los tickets.

`GET /work-orders` (lista, grupos y kanban por estado), `POST /work-orders`, `GET|PATCH /work-orders/:id`, `PUT /assignees`, `POST /take`, `POST /time-entries`, `POST|DELETE /parts`, `POST /external-costs`, `POST /complete`.

- **Costo de la OT = repuestos + mano de obra + costos externos.**
  - Repuestos: cantidad × costo congelado al consumir.
  - Mano de obra: horas registradas × **tarifa por hora del área**.
  - Externos: proveedor, factura adjunta, monto.
- **Estado del activo:** al abrir una OT correctiva se pregunta *"¿El equipo queda fuera de servicio?"*. Si la respuesta es sí, el activo pasa a *En reparación* y empieza a contar el tiempo de parada. Al completar la OT vuelve a *Operativo* (o pasa a *De baja* si la reparación no tiene arreglo).
- Completar exige **notas del trabajo realizado**.
- Tiempo real: eventos `work_order:updated` a la sala del área.

Decisiones:
- **La tarifa es por área, no por persona.** Una tarifa por técnico expondría salarios a cualquiera que vea el costo de una OT.
- **Las horas se registran a mano** (minutos por entrada), no con cronómetro. Un cronómetro que alguien olvida apagar produce costos falsos más dañinos que una estimación honesta.
- **Las OT no tienen SLA propio.** El plazo lo lleva el ticket que la originó (lo que espera el solicitante); los preventivos tienen fecha programada y se marcan *vencidos* si la pasan.

**DoD:** un técnico toma una OT, registra 2 h, consume un repuesto y la completa; el costo total cuadra a mano (`horas × tarifa + repuesto + externo`); el activo estuvo *En reparación* exactamente entre la apertura y el cierre.

---

### A4 · Repuestos e inventario — *1 semana*

**Objetivo:** saber qué hay, qué se gasta y cuándo reponer.

`GET|POST|PATCH /spare-parts`, `POST /spare-parts/:id/movements` (entrada, ajuste con motivo), `GET /spare-parts/:id/movements`, `GET /spare-parts/export`.

- Lista con stock actual, mínimo y una marca clara de **bajo mínimo**.
- Consumir un repuesto en una OT descuenta stock; quitarlo de la OT o cancelarla lo **devuelve** (movimiento `return`, nunca un borrado).
- **No se permite stock negativo:** si no hay suficiente, la OT puede pasar a *En espera de repuesto*.
- Alerta `low_stock` al supervisor la primera vez que se cruza el mínimo (con marca para no repetirla, como el aviso de SLA).

**DoD:** dos consumos simultáneos del último repuesto → uno pasa y el otro recibe 409 (prueba de concurrencia); el stock siempre es igual a la suma de sus movimientos.

---

### A5 · Mantenimiento preventivo — *1 semana*

**Objetivo:** pasar de reparar cuando falla a mantener antes de que falle.

`GET|POST|PATCH /maintenance-plans`, `POST /maintenance-plans/:id/pause`.

- Plan: *"Limpieza de aire acondicionado cada 3 meses"*, con lista de verificación (checklist) que la OT copia.
- Un plan puede ser **de un activo** o **de un tipo de activo en un área** ("todas las impresoras de TI cada 6 meses").
- **Trabajo diario** (06:00, zona de la empresa): genera la OT preventiva `leadDays` días antes de la fecha, y avisa `preventive_due` / `preventive_overdue`.
- Calendario mensual de preventivos en la pantalla del módulo.

Decisiones:
- **Dos modos de recurrencia**, elegidos por plan:
  - `fixed`: cada 3 meses desde la fecha inicial, aunque un mantenimiento se haya hecho tarde. Sirve para lo que exige una norma o un contrato.
  - `from_last`: 3 meses desde el último completado. Sirve para desgaste real.
- **El trabajo es idempotente:** si corre dos veces el mismo día, no genera dos OT para la misma fecha (índice único `{planId, scheduledFor}`).
- **Un activo dado de baja pausa sus planes** automáticamente.

**DoD:** con la hora inyectada, el trabajo genera exactamente una OT por plan vencido en ambos modos; completar tarde una OT `from_last` corre la siguiente fecha y en `fixed` no.

---

### A6 · Alertas, panel y reportes — *1 semana*

**Objetivo:** que el módulo se mida, como se mide el de tickets.

**Panel de mantenimiento** (página propia, no mezclado con el tablero de tickets):
- KPI: OT abiertas, preventivos de la semana, preventivos vencidos, repuestos bajo mínimo, costo del mes.
- Lista de alertas: garantías por vencer, activos con fallas repetidas, stock bajo.

**Alertas** (trabajo diario): `warranty_expiring` (30 días antes), `repeated_failures` (3 correctivas en 90 días, configurable). Una sola vez por activo y motivo.

**Reportes:** el constructor de F7 recibe una **segunda fuente de datos**, `maintenance`, con su propio catálogo:

| Medida | Cálculo |
|---|---|
| **MTBF** (tiempo medio entre fallas) | Tiempo operativo ÷ número de fallas del período |
| **MTTR** (tiempo medio de reparación) | Tiempo total en reparación ÷ número de reparaciones |
| **Disponibilidad** | Tiempo operativo ÷ (operativo + en reparación). Equivale a MTBF ÷ (MTBF + MTTR) |
| Costo total / por activo / por tipo | Suma de `costTotal` de las OT completadas en el período |
| Cumplimiento de preventivos | Preventivos completados a tiempo ÷ preventivos programados |
| OT creadas, completadas, abiertas | Recuentos con su propia ancla de fecha, como en F7 |
| Consumo de repuestos | Suma de movimientos `consume` − `return` |

Dimensiones: tiempo, activo, tipo, área, ubicación, técnico, tipo de OT, repuesto.

Decisiones:
- **MTBF, MTTR y disponibilidad se miden en horas laborables**, con el mismo motor que el SLA. Una impresora que falla el viernes a las 18:00 y se repara el lunes a las 9:00 no estuvo "60 horas parada" para nadie: estuvo 1 hora laborable.
- **Una falla = una OT correctiva.** Los preventivos no cuentan como fallas, y los tickets sin OT tampoco (ver A2).
- **El widget guarda su fuente** (`source: "tickets" | "maintenance"`, `"tickets"` por defecto en Zod). Los reportes guardados del módulo 1 siguen funcionando sin migración.
- **Plantillas nuevas:** *Costo por área*, *Disponibilidad por tipo de equipo*, *Top 10 activos más caros de mantener*, *Cumplimiento de preventivos*.

**DoD:** MTBF, MTTR y disponibilidad de un activo de la semilla **cuadran con un cálculo escrito aparte** en la prueba; un empleado que manipula el alcance recibe 403, igual que en F7.

---

### A7 · IA, endurecimiento y entrega — *1 semana*

**IA** (con los mismos interruptores en `settings.aiEnabled` y la misma degradación sin clave):

1. **Fallas recurrentes → ¿reparar o reemplazar?** Una regla escrita en código detecta al candidato (fallas repetidas, o costo acumulado de reparaciones ≥ 50 % del precio de compra). Gemini **solo redacta la explicación** a partir del historial. Los números los calcula el código, nunca el modelo.
2. **Estimación del costo de una reparación.** El rango sale del historial: mediana y percentiles 25–75 de las OT correctivas parecidas, con el número de casos usados. Gemini elige **cuáles** OT pasadas se parecen a la falla descrita, por número de lista (el mismo patrón de F5, que le impide inventar identificadores). Con menos de 3 casos parecidos no se muestra estimación.

Decisión: **la IA no inventa cifras.** Un modelo de lenguaje que "estima" 120 USD sin datos detrás es peor que no estimar. Aquí la cifra siempre se puede rastrear hasta OT reales.

**Endurecimiento:**
- E2E con Playwright de los recorridos de la defensa (ver §6).
- Rendimiento: 1.000 activos y 10.000 OT; lista < 2 s, reporte < 3 s.
- Accesibilidad: el estado del activo nunca solo por color; recorrido por teclado; 360 px.
- Actualizar `PRESENTACION.md` con el módulo 2.

**DoD:** sin `GEMINI_API_KEY` el módulo funciona entero (la tarjeta de IA no se monta); con clave, la sugerencia de reemplazo del activo de la semilla aparece con su explicación y sus números.

---

## 5. Calendario

| Semana | Fase |
|---|---|
| 1 (primera mitad) | A0 — contratos, modelo, permisos, semilla |
| 1 (segunda mitad) – 2 | A1 — inventario |
| 3 | A2 — averías e integración con tickets |
| 4 – 5 (mitad) | A3 — órdenes de trabajo |
| 5 (mitad) – 6 (mitad) | A4 — repuestos |
| 6 (mitad) – 7 (mitad) | A5 — preventivos |
| 7 (mitad) – 8 (mitad) | A6 — alertas, panel, reportes |
| 8 | A7 — IA y entrega |

> **Hito de seguridad:** al terminar A3 (semana ~5) ya existe un módulo defendible: inventario, averías desde tickets y órdenes de trabajo con costo. Lo que viene después lo mejora; si falla, la presentación no se cae.

---

## 6. Recorridos de la defensa

Los que cubren los E2E de A7 y conviene ensayar:

1. **De la queja al equipo reparado:** un empleado reporta "la impresora no imprime" vinculando el equipo → el técnico de TI convierte el ticket en OT, registra horas y un repuesto → completa → el ticket recibe el aviso y se resuelve → la línea de tiempo del activo muestra todo.
2. **Preventivo automático:** el plan del aire acondicionado genera su OT y su aviso; el técnico la completa con la lista de verificación.
3. **Stock bajo:** consumir un repuesto lo deja bajo mínimo y el supervisor recibe la alerta.
4. **¿Reparar o reemplazar?:** el activo con fallas repetidas muestra la sugerencia de la IA con sus números.
5. **Reportes:** MTBF, MTTR y costo por área en el constructor, con exportación.

---

## 7. Plan B: orden de recorte

Recortar **en este orden**, de arriba hacia abajo. Cada línea cae sin romper lo anterior:

1. Estimación de costo por IA (A7)
2. Sugerencia de reemplazo por IA — se queda la **alerta** de fallas repetidas, que no depende de IA (A7)
3. Calendario mensual de preventivos — se queda la lista (A5)
4. Medidas de mantenimiento en el constructor — se quedan **plantillas fijas** (A6)
5. Planes por tipo de activo — se quedan los planes por activo (A5)
6. Modo `fixed` de recurrencia — se queda `from_last` (A5)
7. Costos externos de proveedor — se quedan repuestos y mano de obra (A3)

**Nunca se recorta:** inventario con historial, permisos por área responsable, vínculo ticket → activo → OT, costo de la OT, stock sin negativos y preventivos que generan OT. Es lo que justifica que los dos módulos estén en una sola herramienta.

---

## 8. Calidad: qué se prueba y dónde

| Qué | Cómo | Cuándo |
|---|---|---|
| Matriz de permisos ampliada | Vitest sobre el motor puro, una prueba por fila | A0 |
| El empleado no ve costos ni activos ajenos | Supertest | A1 |
| Ticket → OT → historial del activo | Supertest | A2 |
| Transiciones de OT inválidas | Supertest: 409 | A3 |
| Costo de la OT | Vitest: cálculo puro en centavos, con tarifa, repuesto y externo | A3 |
| Tiempo de parada del activo | Vitest con la hora inyectada | A3 |
| Stock nunca negativo, consumo concurrente | Supertest con dos peticiones en paralelo | A4 |
| Stock = suma de movimientos | Supertest tras consumir, devolver y ajustar | A4 |
| Generación de preventivos, idempotencia, dos modos | Vitest sobre la función del trabajo, hora inyectada | A5 |
| MTBF / MTTR / disponibilidad | Vitest contra un cálculo escrito aparte, con fines de semana | A6 |
| Alcance de reportes de mantenimiento | Supertest: payload manipulado → 403, por rol | A6 |
| Reportes guardados del módulo 1 siguen abriendo | Supertest: widget sin `source` = `tickets` | A6 |
| Módulo 2 sin clave de IA | Suite con proveedor desactivado | A7 |
| Recorridos de la defensa | Playwright | A7 |

---

## 9. Riesgos

| Riesgo | Mitigación | Fase |
|---|---|---|
| MTBF y disponibilidad salen vacíos o absurdos en la demo | Semilla con 12 meses de historial y fallas distribuidas de forma realista | A0 |
| Errores de redondeo en costos | Montos en centavos enteros; cálculo de costo como función pura probada | A0, A3 |
| El formulario de nuevo ticket pierde su simplicidad | "Vincular un equipo" como enlace opcional, no como campo | A2 |
| Stock inconsistente por consumos simultáneos | `$inc` atómico condicionado + libro de movimientos | A4 |
| El trabajo de preventivos duplica OT | Índice único `{planId, scheduledFor}` | A5 |
| El constructor de reportes se rompe al añadir una fuente | `source` con valor por defecto; las pruebas de F7 corren sin cambios | A6 |
| La IA inventa cifras de costo | Los números los calcula el código; la IA solo elige casos parecidos y redacta | A7 |
| Cuota de Gemini (5 peticiones/min en el plan gratuito) | Las funciones de IA del módulo 2 se ejecutan bajo demanda (al abrir la ficha), con caché | A7 |

---

## 10. Fuera de alcance (ideas para después)

- **Códigos QR** en cada activo para abrir su ficha o reportar una falla desde el móvil.
- Mantenimiento por **uso** (horas de motor, páginas impresas) en vez de por calendario.
- Órdenes de compra y proveedores como entidad.
- Depreciación contable de activos.
- Importación masiva de inventario desde Excel/CSV.
- Varias monedas con tipo de cambio.

---

## 11. Arranque inmediato

1. Generalizar `nextTicketNumber()` a `nextNumber(kind)` sin cambiar el formato `TK-` de los tickets.
2. Escribir los esquemas Zod de `packages/shared/src/maintenance/` y `settings.maintenance` (USD por defecto).
3. Ampliar el motor de permisos **con sus pruebas** antes del primer endpoint.
4. Escribir la función pura de **costo de OT** y la de **tiempo de parada** con sus pruebas: son el equivalente al motor de SLA del módulo 1, lo más fácil de romper y lo más caro de arreglar después.
5. Ampliar la semilla con 12 meses de historial.

---

*Documento vivo. Al cerrar cada fase, anotar debajo de ella las decisiones tomadas al ejecutarla, como en `PLAN_DESARROLLO.md`.*
