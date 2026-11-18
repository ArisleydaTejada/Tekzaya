# Plan de implementación: rol Solicitante

> **Origen:** `docs/ajustes.md`.
> **Base documental:** `Tekzaya_Especificacion.md` §4 (roles y permisos) y §7.2.1 (tablero del empleado).
> **Calendario estimado:** 4–5 días a un frente.
> **Estado:** implementado (S0–S4). Las decisiones de §6 quedaron cerradas con la opción recomendada.

**Decisiones tomadas antes de empezar:**

| Decisión | Elegido | Por qué |
|---|---|---|
| Nombre | **Solicitante** en pantalla, `requester` en el código | Se puede renombrar después: solo cambia la etiqueta |
| Dónde vive | **Valor nuevo de `role`** (`"employee" \| "requester" \| "admin"`), no una bandera más | Es excluyente con las demás: un solicitante no puede ser supervisor, ni RRHH, ni admin |
| Área del solicitante | **Sigue teniendo área** (`areaId` obligatorio) | Los reportes, los activos que usa su área y la creación en nombre de compañeros dependen de ella |
| Áreas que atienden | **Bandera nueva en el área: `receivesTickets`** (por defecto `true`) | Sin ella, la IA puede mandar un ticket a un área donde todos son solicitantes y nadie lo atiende |

---

## 0. El cambio de fondo

Hoy la especificación (§4.1) dice: *"todo miembro de un área puede atender los tickets dirigidos a ella"*. El código lo aplica en un único sitio, `isAreaMember` (`packages/shared/src/permissions/permissions.ts`), más algunas consultas que comparan `actor.areaId` directamente.

El solicitante rompe esa regla. **Pertenece a un área, pero no es agente de ella.** Por eso el plan separa dos ideas que hoy son la misma:

- **`belongsToArea(actor, areaId)`**: está en esa área (para activos que usa, crear en nombre de un compañero, reportes).
- **`isAreaMember(actor, areaId)`**: es **agente** de esa área. Para un solicitante siempre es `false`.

Así, la mayoría de las reglas (`canViewTicket`, `canReadInternalNotes`, `canSelfAssign`, `canWriteInternalNote`, activos, órdenes…) se corrigen solas. El resto del plan cubre los lugares que no pasan por `isAreaMember`.

**Riesgo principal:** fuga de datos. Si una consulta compara `areaId` a mano y se olvida, el solicitante vería tickets y notas internas de su área. Por eso la fase S1 termina con una prueba que recorre todos los endpoints de lectura con un solicitante.

---

## S0. Modelo y permisos (`packages/shared`)

**Cambios:**

- `enums.ts`: `ROLES = ["employee", "requester", "admin"]`. Actualizar el comentario de roles.
- `permissions.ts`:
  - `isRequester(actor)`.
  - `isAreaMember`: devuelve `false` si `isRequester(actor)`.
  - `belongsToArea(actor, areaId)`: la comparación simple de hoy.
  - `isSupervisorOf`: `false` para un solicitante, aunque llegue con `isAreaSupervisor: true` por error de datos.
  - `canCreateOnBehalfOf`: `false` para un solicitante.
  - `canRequestJoin` y `canMerge`: revisar que devuelvan `false`.
- `permissions/maintenance.ts`: `usesAsset` sigue usando `actor.areaId` (el solicitante **sí** ve los equipos que usa su área y puede vincularlos a su ticket). No hace falta tocar nada más: `canViewAssetDetails` y `canManageAsset` ya pasan por `isAreaMember` / `isSupervisorOf`.
- `area.ts`: `receivesTickets: z.boolean()` en `area`, y en `createAreaInput` con `default(true)`.
- `stats.ts`: nueva variante de KPI `kind: "requester"` (ver S3).
- `user.ts` / esquemas de alta y edición: rechazar `role: "requester"` junto a `isAreaSupervisor` o `hasGlobalReadAccess` (`refine`).

**Pruebas:**

- `permissions.test.ts`: una columna nueva en la matriz con un solicitante de Ventas contra un ticket propio y uno de Ventas ajeno. Lo esperado:
  - Ticket propio: ve, responde, cancela y cambia la categoría. **No** ve notas internas.
  - Ticket ajeno de su área: no lo ve, no se lo asigna, no escribe notas.
- `maintenance.test.ts`: ve la ficha básica de un equipo que usa Ventas, pero no su historial ni sus costos.

**DoD:** `pnpm test` en `shared` en verde con la matriz ampliada.

---

## S1. API: cerrar todo lo que compara `areaId` a mano

| Lugar | Cambio |
|---|---|
| `models/user.model.ts` | Toma `ROLES` del paquete compartido, así que el `enum` se actualiza solo. Revisarlo. |
| `models/area.model.ts` | Campo `receivesTickets: { type: Boolean, default: true }`. Las áreas existentes quedan en `true`, sin migración. |
| `tickets/ticket.access.ts` → `visibilityFilter` | Para un solicitante, quitar `{ areaId }` del `$or`: solo ve lo que pidió, creó o heredó de una fusión. |
| `tickets/ticket.access.ts` → `scopeFilter` | `area`, `assigned`, `unassigned` y `settled`-del-área → `403` para un solicitante. Solo admite `mine` (y `all`, que con el filtro anterior equivale a `mine`). |
| `tickets/tickets.routes.ts` (crear) | Rechazar `requesterId` ajeno (ya lo cubre `canCreateOnBehalfOf`) y un `areaId` destino con `receivesTickets: false`. |
| `tickets/ticketActions.routes.ts:114` | Usa `actor.areaId !== ref.areaId`; cambiar a `isAreaMember`. Transferir a un área con `receivesTickets: false` → `422`. |
| `areas/areas.routes.ts` → `/areas/:id/members` y `/workload` | Excluir `role: "requester"` de la consulta. Un solicitante que las llame → `403`. |
| `notifications.service.ts` → `areaMembersExcept` | Excluir solicitantes: no reciben `ticket_created_in_area` ni avisos del área. |
| `realtime/realtime.ts` | El solicitante **no** se une a la sala `area:<id>`. Solo recibe su sala de usuario y las de sus tickets. |
| Reparto automático (`shared/assignment.ts` y quien carga sus candidatos) | Excluir solicitantes de los candidatos. |
| `ai/ai.service.ts` → `suggestArea` | Solo ofrecer áreas con `receivesTickets !== false`. Lo mismo en `GET /areas` cuando se pide para el formulario de creación (parámetro `?receivesTickets=true`). |
| `stats/stats.scope.ts` | Para un solicitante, siempre alcance personal. Pedir el área → `403`. |
| `stats/stats.service.ts` → `/stats/overview` | Devolver `kpis.kind: "requester"` (S3). |
| `reports/reports.scope.ts` | Alcance solo `self` y perspectiva solo `requester`. Un reporte guardado que pida otra cosa se abre recortado (`scopeNarrowed`), igual que hoy con un supervisor que pierde el rol. |
| `admin/users.routes.ts` | Al pasar a `requester`: quitar `isAreaSupervisor` y `hasGlobalReadAccess`, y **desasignarlo de sus tickets activos** (o rechazar el cambio si tiene tickets activos; ver la decisión pendiente). Mantener la regla del último admin. |
| `admin/areas.admin.routes.ts` | Editar `receivesTickets`. Al marcar supervisores, rechazar solicitantes. |
| `auth.service.ts` / `middleware/auth.ts` | Ya copian `role`. Comprobar que `requester` viaja en `/me`. |
| Mantenimiento (`assets`, `workOrders`, `plans`, `spareParts`) | Revisar los `actor.isAreaSupervisor` sueltos (`assets.routes.ts:288`, `plans.routes.ts:140`, `spareParts.routes.ts:202`): usar `isSupervisorOf` o comprobar el rol. |

**Datos de prueba:**

- `test/fixtures.ts`: añadir `requesterVentas`.
- `seed/catalog.ts`: 2 solicitantes (uno en Ventas, otro en Finanzas). Opcional: un área de ejemplo con `receivesTickets: false`.

**Pruebas (`apps/api`, ejecutadas desde `apps/api`):**

- `requester.test.ts`, la prueba de fuga. Con `requesterVentas` y tickets de Ventas que no son suyos:
  - `GET /tickets` con cada `scope`, `GET /tickets/:id`, `/tickets/export`, `/stats/*`, `/reports/*`, `/areas/:id/members` y `/areas/:id/workload`.
  - En cada caso: o `403`, o una respuesta que no contiene ningún ticket ajeno ni ninguna nota interna.
- Creación: no puede crear en nombre de otro ni apuntar a un área que no atiende tickets.
- Notificaciones: crear un ticket hacia Ventas no le genera aviso.
- Admin: no se puede crear un solicitante supervisor.

**DoD:** la prueba de fuga en verde, y la suite de API completa sin regresiones.

---

## S2. Áreas que atienden tickets

**Cambios:**

- Administración → Áreas y categorías: interruptor **"Atiende tickets"** en el alta y la edición del área.
- Aviso en la lista de áreas: *"Atiende tickets, pero no tiene a nadie que los resuelva"* cuando un área tiene `receivesTickets: true` y ningún miembro activo que no sea solicitante.
- Desactivar `receivesTickets` en un área con tickets abiertos: se permite, pero se avisa con el número de tickets abiertos. No se mueven solos.
- Crear ticket y Transferir: el selector de área solo muestra las que atienden tickets.

**DoD:** con solo TI marcada, la IA y el formulario solo ofrecen TI, y la API rechaza las demás.

---

## S3. Interfaz del solicitante (`apps/web`)

### Administración (`AdministracionPage.tsx`)

- `ROLE_CHOICES`: añadir `"requester"` con la etiqueta **"Solicitante"** y una descripción corta: *"Solo crea tickets y sigue los suyos. No atiende tickets de su área."*
- Orden de la tabla (`role` en la línea 121): el solicitante va al final.
- Tipos `"employee" | "admin"` repetidos en el archivo (líneas 532, 728 y 732) → usar `Role` del paquete compartido.

### Barra lateral y barra superior

- Visible: **Tablero**, **Nuevo ticket**, **Mis tickets**, **Reportes** (solo sus datos), **Activos** (los que usa su área), **Perfil**.
- Oculto: Panel de mantenimiento, Órdenes, Repuestos, Preventivos y Administración. Hoy ya dependen de `seesWorkOrders` / `isAdmin`; comprobar que un solicitante da `false`.

### Tablero (`DashboardPage.tsx`)

Nueva rama `RequesterTiles` para `kpis.kind === "requester"`. Las 4 tarjetas:

| Tarjeta | Definición | Enlace |
|---|---|---|
| Abiertas | Mis solicitudes sin resolver | `/tickets?scope=mine&status=active` |
| Necesitan tu respuesta | Mis solicitudes **En espera** | `/tickets?scope=mine&status=on_hold` |
| Sin respuesta aún | Abiertas que nadie del área ha respondido | `/tickets?scope=mine` |
| Resueltas | Resueltas en el período | `/tickets?scope=settled` |

> **Cambio al implementar:** la tarjeta "Con respuesta nueva" pasó a ser "Sin respuesta aún". El sistema no guarda qué mensajes leyó cada persona, así que "no leída" no se puede contar sin añadir ese registro.

- Panel principal: **"Mis solicitudes"** (el de §7.2.1, ya existe), a todo el ancho y con más filas (8 en lugar de 5).
- Sin el panel "Asignados a mí" ni el estado de disponibilidad.
- Si tiene encuestas de satisfacción pendientes, mostrar un aviso encima del panel.
- Sin solicitudes: el estado vacío actual (*"Aún no has creado solicitudes"* + **"Crear mi primer ticket"**).

### Tickets (`TicketsPage.tsx`)

- Solo la pestaña **"Mis solicitudes"** (`scope=mine`). Sin Kanban de área ni acciones masivas: la línea 702 ya las limita por área, pero hay que ocultarlas.
- El título de la página pasa a **"Mis solicitudes"**.

### Crear ticket (`CreateTicketPage.tsx`)

- Sin el selector "en nombre de".
- El área destino solo ofrece las que atienden tickets (S2).

### Detalle del ticket

No hace falta cambiarlo: los botones ya dependen de `permissions` (`ticket.view.ts:252`). Comprobar a mano que el solicitante no ve notas internas, asignar, prioridad, transferir ni fusionar.

### Disponibilidad y perfil

- Ocultar el interruptor Disponible / Ausente: no atiende nada.

**DoD:** el recorrido completo con la cuenta de solicitante de la semilla: entrar, crear, recibir respuesta, contestar, ver la resolución y responder la encuesta. Sin ver nada del área.

---

## S4. Pruebas E2E, accesibilidad y documentación

- `e2e/accounts.ts`: cuenta de solicitante. `auth.setup.ts`: su sesión.
- `e2e/14-solicitante.spec.ts`:
  1. El admin crea un solicitante.
  2. El solicitante crea un ticket hacia TI y comprueba que no puede elegir un área que no atiende.
  3. Un agente de TI responde.
  4. El solicitante ve la respuesta en el tablero (tarjeta y punto azul) y contesta.
  5. Al abrir `/tickets?scope=area` a mano, no ve nada del área.
- `accesibilidad.spec.ts`: el tablero del solicitante, en ambos temas y a 360 px.
- Documentación:
  - `Tekzaya_Especificacion.md` §4.1, §4.2 y §4.3: el principio básico ya no vale para todos, una fila nueva en la tabla de roles, una columna nueva en la matriz y un apartado §7.2.x para su tablero.
  - `GUIA_DE_USUARIO.md`: una sección del solicitante.
  - `DOCUMENTACION_TECNICA.md`: la diferencia entre `isAreaMember` y `belongsToArea`.

**DoD:** E2E y accesibilidad en verde. La especificación refleja el rol nuevo.

---

## 5. Orden y dependencias

```
S0 ──► S1 ──► S3 ──► S4
        └──► S2 ──┘
```

S0 y S1 son lo que importa para la seguridad. Si hay que recortar, S2 se puede posponer con el aviso de *"área sin agentes"* como mínimo, y el tablero (S3) puede empezar reutilizando el panel "Mis solicitudes" que ya existe.

## 6. Decisiones (cerradas)

1. **Cambiar a solicitante a alguien con tickets asignados.** Hay dos opciones:
   - (a) Rechazar el cambio hasta que los reasignen. **Elegido:** es explícito y no deja tickets huérfanos (`409 has_open_tickets`).
   - (b) Desasignarlo automáticamente y avisar al supervisor.
2. **Reportes del solicitante.** Hay dos opciones:
   - Mantener la sección con solo sus datos. **Elegido:** el servidor fija la perspectiva "Como solicitante".
   - Ocultarla del todo, para una interfaz más simple.
3. **Activos.** Puede ver la ficha básica de los equipos que usa su área o tiene a cargo, y así vincularlos al reportar una falla. **Elegido:** se mantiene. No ve los que su área mantiene, ni historial ni costos.
