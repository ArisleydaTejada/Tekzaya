# Plan de desarrollo — Tekzaya

> **Base documental:** `Tekzaya_Especificacion.md` (v1.4), `PRODUCT.md`, `DESIGN.md`, `ajustes.md`.
> **Estado del código al escribir este plan:** prototipo de interfaz completo con datos simulados; cero backend.
> **Supuesto de calendario:** ~12 semanas hasta la defensa. Si el plazo real es menor, ver [§7 Plan B](#7-plan-b-orden-de-recorte).

---

## 0. Cómo leer este plan

Este plan **no repite** el plan sugerido de la especificación (§15). Aquel se escribió cuando *"aún no existe código"*; hoy existe todo lo contrario: la interfaz está construida y lo que falta es lo que la sostiene. El orden de trabajo cambia en consecuencia ([§2.1](#21-por-qué-se-invierte-el-orden-del-15)).

Cada fase se define por lo que **retira de riesgo**, no por lo que añade de pantalla. Una fase está terminada cuando cumple su *Definición de listo* (DoD), no cuando "se ve bien".

---

## 1. Punto de partida real

### 1.1 Lo que ya existe y funciona

`apps/web` — React 19 + Vite 8 + TypeScript + Tailwind v4 (~4.600 líneas):

| Superficie | Estado |
|---|---|
| Login | Formulario, validación, bloqueo tras 5 intentos, botón Google (visual) |
| Tablero | 4 KPI, filtros de alcance (Todas/Mi área/Personal) y período (Día/Semana/Mes/Año/Rango), disponibilidad del equipo |
| Tickets | Vistas **Lista**, **Grupos** y **Kanban** (dnd-kit, arrastrar funciona), pestañas de alcance, filtros, buscador |
| Crear ticket | 4 campos, sugerencia de área simulada, "en nombre de un compañero" |
| Detalle | Conversación pública/interna, redactor con fantasma de autocompletado (Tab), modal Asignar, modal Fusionar |
| Administración | Usuarios, Áreas y categorías, Configuración |
| Reportes | Pestaña Plantillas con gráficas Recharts (dona, barras, barras por persona) |
| Transversal | Tema claro/oscuro, barra lateral plegable, sistema de diseño en tokens (`index.css`), 360 px |

Dependencias de la especificación **ya instaladas**: `recharts`, `@dnd-kit/core`, `react-router-dom`, `motion`.

### 1.2 Lo que parece funcionar pero es simulado

Esto es deuda, no producto. Lo que queda vive en `apps/web/src/data/mock.ts`:

- ~~**Tablero**~~ — migrado por completo: los 4 KPI, el alcance, el período, la disponibilidad del equipo y la franja de incidente.
- **Reportes:** solo la pestaña Plantillas tiene contenido, y con datos del mock; *Mis reportes* y *Nuevo* son estados vacíos. Migra en **F7**.
- ~~**Administración**~~ — migrada por completo: Usuarios, Áreas y categorías y Configuración.
- **Sin `GEMINI_API_KEY`, no hay IA** — y es un modo de funcionamiento previsto, no una carencia: el ticket entra con prioridad *Media* y queda `pending`, listo por si algún día se pone la clave.

> Mientras queden páginas con mock, `mock.ts` traduce los enumerados al contrato
> (`CONTRACT_PRIORITY`, `CONTRACT_STATUS`, `CONTRACT_SLA`). Es el único punto de
> traducción y desaparece con la última página migrada.

**Ya no es simulado:** sesión y permisos (F2); tickets, conversación, SLA,
adjuntos e historial (F3); asignación, transferencias, fusión de duplicados,
trabajos programados y administración completa (F4); las cinco funciones de
IA (F5); y tablero, notificaciones, tiempo real, CSAT y exportación CSV (F6).
**Solo Reportes sigue importando de `mock.ts`.**

### 1.3 Lo que no existe en absoluto

E2E con Playwright.

> **Cerrado en F0 y F1:** monorepo con workspaces, `packages/shared` (contrato Zod + motor de SLA con 21 pruebas), `apps/api` (Express 5, modelos Mongoose con índices, semilla de 101 tickets), MongoDB Community, CI y `.env.example`.
>
> **Cerrado en F2:** autenticación con JWT en cookies `httpOnly`, Google Identity Services, `/me`, disponibilidad y motor de permisos probado fila a fila.
>
> **Cerrado en F3:** endpoints de tickets, conversación y adjuntos, con 26 pruebas de integración (Supertest contra Mongo) y un servicio de MongoDB en CI.
>
> **Cerrado en F5:** `AIService` tras una interfaz propia, las cinco funciones de IA, la cola de clasificación con reintentos y el modo sin clave probado. 178 pruebas en total.
>
> **Cerrado en F4:** transferencia, fusión y separación de duplicados, "Unirme", carga del área, tres trabajos programados con `node-cron`, la administración completa (personas, áreas, categorías y configuración) y el circuito de invitaciones y restablecimiento de contraseña. 135 pruebas en total.
>
> **Cerrado en F6:** Socket.IO con las tres salas, la tabla de avisos del §8 completa, la bandeja de notificaciones, los cinco endpoints de `/stats`, el tablero de los cuatro roles con datos reales, la encuesta CSAT y la exportación CSV desde el servidor. 198 pruebas en total.

### 1.4 Desajustes de contrato que hay que resolver antes de escribir el backend

Hallazgos concretos del código actual. Resolverlos en F0 evita una migración dolorosa después:

| # | Desajuste | Hoy en `apps/web` | Especificación §11 | Decisión propuesta |
|---|---|---|---|---|
| 1 | Enumerados de estado | `"abierto"`, `"en_progreso"`… (español) | `"open"`, `"in_progress"`… (inglés) | **Inglés en el contrato**; el español queda solo como etiqueta de interfaz |
| 2 | Identificadores de área | Unión de literales `"it" \| "rrhh" \| …` | `ObjectId` | `ObjectId` como `string`; el área deja de ser un tipo cerrado (el admin puede crear áreas) |
| 3 | Personas | Cadenas de texto (`requester: "Camila Rojas"`) | `ObjectId` | Referencias por id; el nombre se resuelve al leer |
| 4 | Roles | `role: "employee" \| "area_supervisor" \| "hr_supervisor" \| "admin"` | `role` + `isAreaSupervisor` + `hasGlobalReadAccess` | Adoptar el modelo de banderas del spec (§4.2): combina permisos sin duplicar roles |
| 5 | Biblioteca de UI | Componentes propios (`Plate`, `Field`, `StatTile`…) | "shadcn/ui" | **No introducir shadcn ahora.** Los componentes propios ya codifican `DESIGN.md`; mezclarlos a mitad de camino fragmenta el lenguaje visual sin ganancia |
| 6 | Estado de servidor | Ninguno | TanStack Query | Añadirlo en F2 junto con la capa de datos |
| 7 | Formularios | `useState` a mano | React Hook Form + Zod | Añadirlo cuando los formularios pasen a la API (F2–F3) |

---

## 2. Estrategia

### 2.1 Por qué se invierte el orden del §15

El plan del spec avanza por capas de producto (base → acceso → tickets → SLA → IA → tableros → reportes), con la interfaz construyéndose al final de cada una. Ese orden ya se ejecutó de facto **para la interfaz**, y a cambio quedó todo el riesgo técnico concentrado al final: autenticación, permisos, SLA y agregaciones.

El orden nuevo es el inverso: **la interfaz existente es la especificación viva del backend**. Cada fase sustituye un trozo de `mock.ts` por datos reales, de abajo hacia arriba, y la demo nunca deja de funcionar.

Ventajas concretas:

- **La demo siempre está viva.** En cualquier semana hay algo presentable: lo migrado es real y lo no migrado sigue con mock.
- **El riesgo sale primero.** SLA y permisos —lo que el spec marca como riesgo alto (§16)— se atacan en F1 y F2, no en la semana 14.
- **La interfaz no se rehace.** Las pantallas ya pasaron por revisión de diseño; solo cambia de dónde vienen los datos.

### 2.2 Principios de ejecución

1. **Contrato primero.** Cada fase empieza definiendo esquemas Zod en `packages/shared`. Frontend y backend se desarrollan contra el mismo tipo, en paralelo.
2. **Rebanadas verticales.** Nada de "una semana de endpoints sin interfaz". Cada fase cruza web → API → base de datos.
3. **El mock se retira por partes, nunca de golpe.** Un interruptor por módulo permite volver al mock si un endpoint no está listo.
4. **La autorización se prueba, no se confía.** Cada permiso de la matriz §4.3 tiene una prueba que falla si se filtra.
5. **La IA nunca está en el camino crítico.** Si Gemini cae, todo sigue funcionando (principio del spec §6.3).

### 2.3 Arquitectura objetivo

```
Tekzaya/
├─ package.json                 # workspaces npm  (F0)
│                              # MongoDB Community, instalado en el equipo
├─ .env.example                 #                  (F0)
├─ packages/
│  └─ shared/                   # esquemas Zod + tipos + constantes (fuente única)
│     ├─ schemas/               # ticket, user, area, report, settings
│     └─ sla/                   # motor de SLA: función pura reutilizable (F1)
├─ apps/
│  ├─ web/                      # ← ya existe
│  │  └─ src/api/               # cliente HTTP + hooks TanStack Query  (F2)
│  └─ api/                      # Express + Mongoose + Socket.IO       (F0→)
│     ├─ modules/               # auth, tickets, messages, reports, ai, admin
│     ├─ middleware/            # permisos, validación Zod, errores
│     ├─ jobs/                  # SLA, cierres automáticos, reintentos IA
│     └─ seed/                  # datos semilla
```

**Por qué `packages/shared/sla` y no dentro de la API:** el cálculo de SLA con horario laboral y pausas es lo más fácil de romper y lo más caro de depurar (spec §16). Aislado como función pura sin dependencias, se prueba exhaustivamente y el frontend puede usarlo para previsualizar vencimientos sin consultar al servidor.

---

## 3. Fases

### F0 · Fundaciones del monorepo y contratos — *hecha*

**Objetivo:** que exista un esqueleto ejecutable y un contrato de tipos compartido.

- `package.json` raíz con workspaces npm; `tsconfig` base; `.gitignore` raíz; `.env.example` documentado.
- `packages/shared`: migrar `apps/web/src/data/types.ts` a esquemas **Zod** resolviendo los 7 desajustes de [§1.4](#14-desajustes-de-contrato-que-hay-que-resolver-antes-de-escribir-el-backend).
- `apps/api`: Express + TypeScript, cargador de configuración, manejador de errores, middleware de validación Zod, `GET /api/v1/health`.
- MongoDB Community instalado en el equipo como servicio de Windows. *(Decidido: sin Docker. La cadena de conexión es lo único que cambia si más adelante se pasa a Atlas.)*
- CI (GitHub Actions): typecheck + lint + test en cada push.

**DoD:** `npm run dev` en la raíz levanta web + API; `/api/v1/health` responde y reporta `db: connected`; `apps/web` importa un tipo desde `packages/shared` y compila.

---

### F1 · Modelo de datos, semillas y motor de SLA — *hecha*

**Objetivo:** datos reales y creíbles en la base, y el cálculo más delicado resuelto y probado.

- Esquemas Mongoose de las 9 colecciones (§11) con **todos los índices** del spec.
- `counters` con incremento atómico para `TK-000123`.
- **Motor de SLA** en `packages/shared/sla`: horario laboral, festivos, pausas por *En espera*, umbral de riesgo al 75 %, reapertura. Función pura.
- **Script de semilla:** 6 áreas con categorías, ~15 usuarios cubriendo los 4 roles, y **80–120 tickets** distribuidos de forma realista en estados, prioridades, fechas (últimos 90 días), SLA vencidos/en riesgo, CSAT, un grupo de incidente y un par de fusiones.

**DoD:** `npm run seed` es reproducible e idempotente; las pruebas unitarias del SLA cubren fin de semana, festivo, pausa, reapertura y cambio de política, y están en verde.

> Los 22 tickets del mock actual son suficientes para maquetar, pero insuficientes para que las gráficas de Reportes tengan forma. La semilla es un entregable de producto, no un detalle técnico.

---

### F2 · Autenticación, `/me` y permisos — *2 semanas*

**Objetivo:** primera rebanada vertical completa y el sistema de permisos que condiciona todo lo demás.

Backend: `POST /auth/login`, `/auth/google`, `/auth/refresh`, `/auth/logout`, `/auth/accept-invite`, `/auth/reset-password`, `GET /me`, `PATCH /me/availability`, `PATCH /users/:id/availability`.
JWT + refresh en cookies `httpOnly`, bcrypt, Google Identity Services, límite de peticiones en login.
**Middleware de permisos** que resuelve alcance a partir de `role` + `areaId` + `isAreaSupervisor` + `hasGlobalReadAccess`.

Frontend: capa de datos (`src/api/` + TanStack Query + React Hook Form/Zod), `AuthContext`, rutas protegidas por rol, `LoginPage` real, disponibilidad real en la barra superior.

**DoD:** el login con correo y con Google funciona; una ruta protegida rechaza sin token; existe una prueba automatizada **por cada fila de la matriz §4.3**; `LoginPage` ya no importa nada de `mock.ts`.

**Riesgo que retira:** *fuga de datos entre roles* — el riesgo de impacto alto del spec.

---

### F3 · Tickets núcleo y conversación — *hecha*

**Objetivo:** el corazón del producto, sin IA y sin tiempo real.

`GET /tickets` (filtros, orden, paginación, `scope=mine|assigned|area|unassigned|all`), `POST /tickets` (incl. `requesterId` de un compañero del área), `GET /tickets/:id`, `PATCH /tickets/:id` (estado, categoría, prioridad con motivo), `GET|POST /tickets/:id/messages`, `POST /attachments`.

- **Filtrado de notas internas en la consulta**, nunca en el cliente (§10.4).
- Historial de cambios (`statusHistory`, mensajes de sistema) desde el primer día: la auditoría es requisito no funcional (§13).
- Adjuntos en disco fuera del directorio público, servidos por endpoint protegido, validando MIME real y tamaño.

Frontend migrado: `TicketsPage` (Lista y Grupos), `CreateTicketPage`, `TicketDetailPage`.

**DoD:** crear → conversar → resolver funciona de extremo a extremo sin mock; existe una prueba que verifica que **el solicitante no recibe notas internas** ni siquiera perteneciendo al área destino.

Decisiones tomadas al ejecutarla:

- **Los permisos viajan con el ticket.** `GET /tickets/:id` devuelve un bloque `permissions` ya resuelto por el servidor. La interfaz pinta botones a partir de él en vez de deducir el rol; el servidor vuelve a comprobarlo en cada llamada, así que el bloque es comodidad, no autorización.
- **El estado del SLA se calcula al leer**, comparando fechas precalculadas (`responseRiskAt`, `resolutionDueAt`) con el motor de F1. No hace falta un job para que la lista muestre *En riesgo*; el job de F4 solo hará falta para notificar.
- **Máquina de estados en el servidor.** `ALLOWED_TRANSITIONS` rechaza con 409 lo que el ciclo de vida no permite. Estaba previsto para F4 y entra aquí porque el `PATCH` lo necesitaba desde el primer día.
- **Resolver exige nota de solución**, que se publica en la conversación: es lo que el solicitante lee al confirmar el cierre.
- **Adjuntos:** el tipo se decide por los bytes reales del archivo, no por la extensión ni por el `Content-Type`. Se suben como borrador (sin ticket) y se enlazan al crear el ticket o enviar el mensaje; solo los enlaza quien los subió.
- **Adelantado de F4** para no dejar botones muertos en el detalle: `PUT /tickets/:id/assignees`, `POST /tickets/:id/take`, `GET /areas`, `GET /areas/:id/members` y el **Kanban persistente** (soltar una tarjeta emite `PATCH` y el tablero vuelve a su sitio si el servidor rechaza la transición). Queda para F4 lo que sí es trabajo propio de esa fase: transferencias, fusión, jobs y solicitudes de unirse.

---

### F4 · Asignación, ciclo de vida y trabajos programados — *hecha*

**Objetivo:** que el ticket se mueva solo y en equipo.

`PUT /tickets/:id/assignees`, `POST /take`, `/join-request`, `/transfer`, `/merge`, `/unmerge`, `GET /duplicate-candidates`, `GET /areas/:id/workload`, `GET /areas/:id/members`.

- **Jobs (node-cron):** recálculo de estados de SLA, auto-cierre de *Resuelto* a los 3 días hábiles, recordatorio de *En espera* a los 5 días y cierre a los 10.
- **Kanban persistente:** soltar una tarjeta emite `PATCH` y revierte visualmente si el backend rechaza la transición.
- Transferencia devuelve a *Abierto* sin responsables y queda en historial.

> Ya venía hecho de F3: `PUT /assignees`, `POST /take`, `GET /areas/:id/members`, la validación de transiciones (409) y el Kanban persistente.

**DoD:** arrastrar en Kanban persiste tras recargar; un ticket pasa solo a *En riesgo* y a *Vencido*; fusionar y deshacer la fusión funciona conservando el historial.

Decisiones tomadas al ejecutarla:

- **La fusión cambia quién es solicitante, y eso cambia quién lee las notas internas.** Al absorber un duplicado, su solicitante pasa a serlo del principal (`additionalRequesterIds`). Si el motor de permisos no lo supiera, esa persona entraría al ticket como "miembro externo" y leería la trastienda del área. `isOwnTicket` los contempla y hay prueba de que no las ve.
- **Los mensajes de los duplicados no se copian.** La conversación del principal los consulta donde están y los marca con su ticket de origen. Copiarlos habría duplicado adjuntos y roto el "deshacer".
- **Deshacer la fusión corre el plazo** lo que el ticket estuvo absorbido, igual que una pausa de *En espera*: separarlo tres días después no puede devolverlo ya vencido.
- **Transferir no reinicia el SLA.** El reloj mide lo que lleva esperando el solicitante, y él no eligió mal el área. Sí se limpian responsables y categoría, porque pertenecían al área anterior.
- **Los trabajos son funciones puras que reciben la hora**; `node-cron` solo decide cuándo llamarlas. Las pruebas las invocan directamente, sin esperar a que dé un cuarto de hora, y en `NODE_ENV=test` el planificador no arranca.
- **El estado del SLA se sigue calculando al leer** (F3). El trabajo programado no existe para pintar la lista, sino para **avisar** una sola vez al entrar en riesgo o vencer, y para dejar constancia histórica del incumplimiento (`responseBreached` / `resolutionBreached`), que los reportes de F7 no podrán recalcular después.
- **Administración → Configuración pasa a ser real** (SLA por prioridad, jornada, festivos, días de cierre e interruptores de IA), porque es de donde los trabajos leen sus plazos. Cambiar una política **no** recalcula los tickets que ya existen: una edición no puede vencerlos de golpe.

**Hueco de F2 cerrado aquí.** La trazabilidad asignaba los usuarios a F2, pero esa fase solo construyó la autenticación: faltaba toda la administración. Se añadió en F4:

- `GET/POST/PATCH /users` con invitación, edición y desactivación, y `POST /users/:id/access-link`.
- `GET/POST/PATCH /admin/areas`, categorías y `PUT /admin/areas/:id/supervisors`.
- `GET /auth/access`, `POST /auth/accept-invite` y `POST /auth/reset-password`, con las pantallas `/invitacion` y `/restablecer`.

Decisiones de esa parte:

- **El administrador nunca conoce la contraseña de nadie.** Invitar crea la cuenta *sin* contraseña; la elige la persona al abrir el enlace. De la base solo sale la **huella** del token (SHA-256), así que el texto del enlace existe una sola vez, en la pantalla desde la que se copia. Un volcado de la base no abre ninguna cuenta.
- **Un enlace sirve una vez y caduca**: siete días la invitación, dos horas el restablecimiento. Un token inventado, caducado o de otro propósito responde siempre lo mismo, para que probar enlaces no revele qué cuentas existen.
- **Nadie se borra, se desactiva** (spec §7.7). Al desactivar, la persona sale de sus tickets activos; los que se quedan sin ningún responsable vuelven a *Abierto* y su supervisor recibe el aviso.
- **No se puede dejar el sistema sin administrador**: degradar o desactivar la última cuenta con ese rol responde 409, porque desde la propia aplicación no habría forma de recuperarlo.
- **Las áreas y las categorías tampoco se borran.** Un área con tickets sin cerrar no se puede desactivar; una categoría desactivada desaparece del formulario de nuevo ticket pero sigue existiendo para los tickets antiguos y para los reportes.
- **El rol se elige como un solo concepto** ("Supervisor de RRHH"), y la interfaz lo traduce a `role` + banderas. Pedirle al administrador que componga las banderas a mano es pedirle que se equivoque.

---

### F5 · Inteligencia artificial con degradación elegante — *hecha*

**Objetivo:** el diferenciador del producto, sin que pueda tumbar la demo.

`POST /ai/suggest-area`, `/ai/tickets/:id/summary`, `/ai/autocomplete`, `/ai/tickets/:id/incident`, `POST /tickets/:id/incident/dismiss`.

- `AIService` con Gemini (`@google/genai`), salida JSON estructurada, **caché**, límite por usuario, tiempo máximo (autocompletado se descarta a los 1,5 s) y cola de reintentos para la clasificación asíncrona.
- Interruptores por función en `settings.aiEnabled`.
- Sustituye las heurísticas de `CreateTicketPage.tsx` y el fantasma fijo del redactor.

**DoD:** **con `GEMINI_API_KEY` vacía, la aplicación completa sigue siendo usable** (se crea el ticket, con área elegida a mano y prioridad por defecto) — **verificado en el navegador**: el formulario no muestra «IA analizando…» ni sugerencia, el detalle no monta el panel de resumen ni el fantasma, y crear → conversar → resolver funciona igual. Con la clave puesta, **medido de extremo a extremo**: sugerencia de área 0,73 s, resumen 1,1 s, autocompletado 0,63 s. Todo por debajo de los 2 s que pide el DoD.

**Riesgo que retira:** *se agota la cuota gratuita durante la demo* — probado, no supuesto.

Decisiones tomadas al ejecutarla:

- **El blindaje contra inyección de instrucciones envuelve a cualquier proveedor**, no vive dentro de Gemini. Una prueba lo dejó claro a mitad de camino: tal como estaba, cambiar a Groq o a un modelo local se habría llevado la protección por delante. Ahora es un decorador que delimita el texto del usuario y añade la advertencia, y la defensa real —validar la salida contra un esquema Zod— está en el mismo sitio para todos.
- **El modelo elige por número de lista, nunca por identificador.** Al sugerir área o categoría recibe una lista numerada y devuelve un número; así no puede inventarse un `ObjectId`, y si se sale del rango, el esquema lo rechaza y la respuesta se queda en `null`.
- **La IA propone y nunca pisa lo que decidió una persona.** Si un supervisor ya fijó la prioridad, la clasificación no la toca; lo que proponía queda guardado en `ai.suggestedPriority` para poder medir su precisión. Cuando sí la cambia, recalcula el plazo del SLA con la política nueva.
- **La clasificación va detrás de la creación, nunca dentro.** Quien crea un ticket recibe su número y su plazo al instante; la cola en memoria clasifica después, reintenta con espera creciente y se reencola al arrancar, porque el estado fiable está en el documento (`classificationStatus`), no en la cola.
- **El resumen se reutiliza hasta que la conversación avanza tres mensajes** y solo se entrega a quien puede leer las notas internas, porque se construye con ellas dentro.
- **La detección de incidentes hace una preselección sin IA**: si en el área no hay ya al menos dos tickets recientes parecidos, no se llama a Gemini. Es lo que evita gastar cuota en el caso normal, que es que no haya incidente.
- **El modelo se eligió midiendo, no por catálogo.** Con la clave real, `gemini-3.5-flash` tardaba ~10 s y los más nuevos devolvían 503 por saturación; la variante **`gemini-3.5-flash-lite` responde en ~0,7 s** con JSON limpio y acierta el área. Para clasificar un ticket en tres frases, la rapidez vale más que la capacidad de razonar.
- **`GET /ai/status` decide qué se pinta.** Sin clave, la interfaz no monta nada de IA: ni un «analizando…» que no vaya a terminar, ni un botón de regenerar que no vaya a responder. Prometer algo que no puede ocurrir es peor que no ofrecerlo.

---

### F6 · Tiempo real, tableros, notificaciones, CSAT y CSV — *hecha*

`GET /stats/overview`, `/stats/timeseries`, `/by-person`, `/by-category`, `/stats/export?format=csv`, `GET|PATCH /notifications`, `POST /tickets/:id/csat`, `GET /tickets/export`.

- Socket.IO con salas por usuario, área y ticket: `notification:new`, `ticket:updated`, `ticket:message`.
- Tableros de los 4 roles alimentados por agregaciones reales.
- Encuesta CSAT al resolver.

**DoD:** con dos pestañas abiertas, un cambio en una aparece en la otra en menos
de 1 s — **verificado en el navegador**: crear un ticket en una subió el tablero de
la otra de 20 a 21 pendientes (y de 8 a 9 sin asignar) sin recargar, y responder la
encuesta puso el CSAT medio en la tarjeta de la otra pestaña. Los KPI **cuadran con
una consulta manual a la base**: 20 pendientes, 8 sin asignar y 1 resuelto en la
semana, iguales a los `countDocuments` escritos aparte.

Decisiones tomadas al ejecutarla:

- **Por el socket no viaja contenido, solo el hecho de que algo cambió.** Cada evento
  lleva identificadores; la pantalla vuelve a pedir los datos por la API, que es la
  que filtra por permisos. Una sala mal calculada no puede enseñar lo que la API no
  daría. La única excepción son las notificaciones, que van a la sala privada de una
  persona y llegan completas para que la campana reaccione sin otro viaje.
- **Una nota interna no se anuncia en la sala del ticket**, porque ahí está el
  solicitante: su evento va solo a la sala del área. Saber que existe una nota ya es
  más de lo que debe ver, aunque no lleve el texto.
- **Entrar en la sala de un ticket se comprueba contra el motor de permisos**, no
  basta con pedir su identificador. Y la sesión del socket es la misma cookie
  `httpOnly` del navegador: no hay un segundo mecanismo de autenticación que
  mantener ni un token que el JavaScript de la página pudiera leer.
- **Nadie recibe el aviso de su propia acción.** Un aviso de lo que uno acaba de
  pulsar entrena a ignorar la campana, que es la forma de perder los que importan.
- **Los períodos se cortan por calendario de la empresa, no por ventana móvil.**
  "Mes" es el mes en curso, no los últimos treinta días: es como se lee una KPI de
  tablero y es lo único que cuadra con una consulta a mano, que es el DoD.
- **El selector de alcance se arma con `maxReportScope`**, no con una lista fija. Un
  empleado no ve el botón "Todas las áreas" porque pulsarlo solo le daría un 403; el
  servidor recalcula el alcance en cada consulta y descarta lo que venga en el payload.
- **Las horas laborales se calculan en Node, no en la agregación.** El motor de F1
  necesita jornada, festivos y zona horaria, que Mongo no tiene; la consulta trae
  tres fechas por ticket y el cálculo se hace arriba. Se mide sobre los tickets
  **respondidos** en el período, no sobre los resueltos: un ticket puede responderse
  en enero y resolverse en marzo.
- **Los duplicados fusionados quedan fuera de toda métrica** (spec §9): el principal
  ya cuenta el problema una vez, y contar el duplicado inflaría volumen, tiempos y
  cumplimiento a la vez.
- **El CSV lo genera el servidor, siempre.** El botón de la lista de tickets lo
  armaba el navegador con la página que tenía a la vista; ahora es un enlace a
  `/tickets/export`, que aplica los mismos filtros y el mismo alcance, trae todas las
  filas y **nunca** incluye el contenido de las notas internas. El PDF sigue siendo
  del navegador, que es donde está el diseño.
- **La franja de incidente es de quien atiende, no de quien reporta.** Se mostraba en
  la vista personal hasta que se vio en el navegador: decir "tu problema es uno de
  tres" al solicitante contradice la decisión de F5 de ocultarle `incidentLabel`.
  Ahora solo aparece en el alcance de área o global, con prueba que lo fija.
- **La encuesta se abre al resolver y se cierra al cerrar.** El servidor manda
  `permissions.answerCsat` ya resuelto, así que la pantalla no decide cuándo
  mostrarla; una segunda respuesta recibe 409 y la calificación queda en la
  conversación como mensaje de sistema, donde el área ve todo lo demás.
- **Las menciones `@` de la tabla del §8 quedan fuera**, y no por olvido: el redactor
  no tiene selector de menciones, así que no hay nada que notificar. Entran con esa
  función, no antes.

---

### F7 · Reportes personalizables — *2,5 semanas*

La pieza más grande y la que el spec ya señala como candidata a recorte (§16). Se construye en este orden, y cada escalón es entregable por sí solo:

1. `GET /reports/catalog` filtrado por rol + **plantillas** (lo que hoy ya se ve en la interfaz, pero con datos reales).
2. `POST /reports/query` con **revalidación de alcance en el servidor** y gráficas de barras, línea, dona y tabla.
3. `GET /reports/tickets`: lista con filtros avanzados, columnas configurables y `?format=csv`.
4. `GET|POST|PUT|DELETE /reports`: reportes guardados (pestañas *Mis reportes* y *Nuevo*, hoy vacías).
5. Exportación: CSV en el servidor, PDF y PNG en el navegador (`html2canvas` + `jsPDF`).
6. Solo si sobra tiempo: radar, mapa de calor, barra segmentada y comparaciones.

**DoD:** un empleado que manipule el `userId` o el `areaId` del payload recibe **403**, con prueba automatizada que lo demuestra para los 4 roles.

---

### F8 · Endurecimiento, demo y entrega — *1,5 semanas*

- **E2E con Playwright** de los 5 recorridos de la defensa (ya está instalado como dependencia, sin usar).
- **Rendimiento:** cargar 10.000 tickets de prueba y verificar los umbrales del §13 (listados < 2 s, gráfica < 3 s, CSV < 5 s). Ajustar índices y paginación.
- **Accesibilidad:** contraste AA, recorrido completo por teclado, prioridad nunca solo por color, 360 px.
- Pendientes de diseño de `ajustes.md` que queden abiertos.
- Guía de instalación local, `.env.example` final, semilla de demostración congelada.
- **Ensayo completo en el equipo de la presentación**, incluyendo el modo sin IA.

**DoD:** un evaluador clona el repositorio y llega a la aplicación con datos en menos de 10 minutos siguiendo el README.

---

## 4. Trazabilidad: especificación → fase

| Funcionalidad (spec) | Fase |
|---|---|
| Login Google + correo, invitaciones | F2 |
| Roles, matriz de permisos §4.3 | F2 |
| Disponibilidad (disponible/ausente) | F2 |
| Crear ticket, en nombre de un compañero | F3 |
| Listado Lista y Grupos, filtros | F3 |
| Detalle, conversación pública e interna, adjuntos | F3 |
| Estados y ciclo de vida §5.2 | F3 (base) → F4 (automatismos) |
| SLA con horario laboral y pausas | F1 (motor) → F4 (jobs y alertas) ✓ |
| Asignación múltiple, carga, Tomar/Unirme | F3 (asignar/tomar) → F4 (carga, Unirme) ✓ |
| Transferir entre áreas | F4 ✓ |
| Fusión de duplicados y deshacer | F4 ✓ |
| Kanban persistente | F3 ✓ |
| IA: sugerir área, clasificar, resumir, autocompletar, incidentes | F5 ✓ |
| Notificaciones en tiempo real | F6 ✓ |
| Tableros por rol (4 KPI, sin gráficas) | F6 ✓ |
| CSAT | F6 ✓ |
| Exportación CSV | F6 ✓ (tickets/tablero) → F7 (reportes) |
| Reportes personalizables, guardados, plantillas | F7 |
| Exportación PDF | F7 |
| Administración: usuarios, áreas, categorías, SLA | F4 ✓ |
| Invitaciones y restablecimiento de contraseña | F4 ✓ (previsto en F2) |
| Requisitos no funcionales §13 | F8 |
| Fase 2 (activos) | Fuera de alcance — "Próximamente" en el menú |

---

## 5. Paralelización

Con los contratos Zod definidos al inicio de cada fase, dos frentes avanzan sin bloquearse:

| Frente | F0 | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Backend** (modelo, endpoints, jobs) | ● | ● | ● | ● | ● | ● | ● | ● | ○ |
| **Frontend** (capa de datos, migración de páginas) | ● | ○ | ● | ● | ● | ○ | ● | ● | ● |
| **Transversal** (pruebas, semilla, diseño) | ○ | ● | ● | ○ | ○ | ○ | ○ | ○ | ● |

Si el equipo es de **una sola persona**, el orden de fases ya está priorizado por riesgo: ejecutarlo tal cual y usar el [Plan B](#7-plan-b-orden-de-recorte) en cuanto la fecha apriete.

---

## 6. Calendario

Suma de fases: **~16,5 semanas** a un frente; **~12 semanas** con backend y frontend en paralelo.

| Semana | Fases |
|---|---|
| 1 | F0 — *hecha* |
| 2–3 | F1 — *hecha* |
| 3–5 | F2 — *hecha* |
| 5–7 | F3 — *hecha* |
| 7–9 | F4 — *hecha* |
| 9–10 | F5 — *hecha* |
| 10–11 | F6 — *hecha* |
| 11–12 | F7 (escalones 1–4) |
| 12 | F8 |

> **Hito de seguridad:** al terminar F6 (semana ~11) ya existe un producto defendible completo sin Reportes avanzados. Todo lo posterior es mejora, no supervivencia.

---

## 7. Plan B: orden de recorte

Si el plazo se acorta, recortar **en este orden**, de arriba hacia abajo. Cada línea puede caer sin romper lo anterior:

1. Gráficas radar, mapa de calor y barra segmentada (F7.6)
2. Exportación PDF y PNG — se queda el CSV (F7.5)
3. Reportes guardados — se quedan las plantillas (F7.4)
4. Detección de incidentes por IA (F5)
5. Autocompletado con Tab (F5)
6. Encuesta CSAT (F6)
7. Fusión de duplicados (F4)
8. Kanban persistente — se queda como vista de solo lectura (F4)

**Nunca se recorta:** autenticación y permisos, tickets con conversación y filtrado de notas internas, cálculo de SLA, tablero por rol, y datos semilla creíbles. Es el mínimo que sostiene los principios de producto de `PRODUCT.md`.

---

## 8. Calidad: qué se prueba y dónde

| Qué | Cómo | Cuándo |
|---|---|---|
| Motor de SLA (horario, pausas, festivos, reapertura) | Vitest, función pura, casos borde exhaustivos | F1 ✓ |
| Matriz de permisos §4.3 | Vitest sobre el motor puro, **una prueba por fila** | F2 ✓ |
| Filtrado de notas internas | Supertest: el solicitante del área destino **no** las recibe | F3 ✓ |
| Transiciones de estado inválidas | Supertest: rechazo con 409 | F3 ✓ |
| Notas internas tras una fusión | Supertest: el solicitante heredado **no** las recibe | F4 ✓ |
| Fusionar y deshacer conservando el historial | Supertest: vuelve al estado previo, el paso queda registrado | F4 ✓ |
| Trabajos programados | Vitest sobre las funciones, con la hora inyectada | F4 ✓ |
| Enlaces de invitación y restablecimiento | Supertest: un solo uso, caducidad y propósito cruzado | F4 ✓ |
| Desactivar a alguien con tickets | Supertest: sale de sus tickets y los huérfanos vuelven a Abierto | F4 ✓ |
| Tipo real de los adjuntos | Vitest + Supertest: un ejecutable renombrado a `.png` se rechaza | F3 ✓ |
| Degradación sin IA | Suite con proveedor desactivado + comprobación en el navegador | F5 ✓ |
| Inyección de instrucciones | Vitest: el texto llega delimitado y la salida se valida contra el esquema | F5 ✓ |
| La IA no pisa decisiones humanas | Vitest: la prioridad fijada por el supervisor sobrevive a la clasificación | F5 ✓ |
| Alcance de estadísticas | Supertest: `areaId`/`userId` manipulado → 403, por rol | F6 ✓ |
| Destinatarios de cada aviso del §8 | Supertest: quién lo recibe y, sobre todo, quién no | F6 ✓ |
| Una nota interna no genera aviso ni sale en el CSV | Supertest sobre la bandeja y sobre la exportación | F6 ✓ |
| KPI del tablero | Supertest contra `countDocuments` escritos aparte | F6 ✓ |
| Encuesta CSAT | Supertest: solo el solicitante, solo resuelto, una sola vez | F6 ✓ |
| Alcance de reportes | Supertest: payload manipulado → 403, por rol | F7 |
| Recorridos de la defensa | Playwright E2E | F8 |
| Rendimiento con 10.000 tickets | Script de carga + medición contra §13 | F8 |

Lo demás se prueba a mano. La regla del spec (§13, *Calidad*) es explícita: **SLA y permisos son lo crítico**; ahí va el esfuerzo de pruebas.

---

## 9. Datos semilla

La semilla es material de defensa, no relleno. Debe producir, sin tocar nada:

- Los 4 roles con sesión iniciable (credenciales en el README).
- Tickets en **los 9 estados**, incluidos *Fusionado* y *Cancelado*.
- SLA en los 3 estados, con al menos un vencido visible en el tablero.
- Un grupo de incidente detectado (3+ tickets del mismo síntoma en 48 h).
- CSAT respondidos suficientes para que la media tenga sentido.
- Volumen y fechas repartidos en 90 días para que las gráficas de Reportes no salgan planas.
- Una persona *ausente* con fecha de regreso, para el modal de asignación.

Regla de `PRODUCT.md`: se presentan **siempre como datos semilla**, nunca como usuarios o métricas reales.

---

## 10. Riesgos operativos y demo

Además de los del spec §16, los que introduce el estado actual del repositorio:

| Riesgo | Mitigación | Fase |
|---|---|---|
| La migración de mock a API se hace de golpe y rompe la demo | Interruptor por módulo; migrar una página por fase | F2 |
| Los enumerados en español del prototipo se filtran al contrato | Resolver los desajustes de §1.4 **antes** de escribir el primer esquema Mongoose | F0 |
| Las páginas mutan el array importado; el patrón se copia a la API | La capa de datos entra **antes** que el primer endpoint de tickets | F2 |
| La semilla es muy pequeña y las gráficas quedan vacías | 80–120 tickets como entregable con DoD propio | F1 |
| La demo depende de internet (Gemini y Google) | Modo sin IA probado + login por correo como respaldo | F5 ✓, F8 |
| **El plan gratuito de Gemini permite 5 peticiones por minuto** | Medido con la clave real: escribir en el formulario de nuevo ticket puede agotarlo en segundos. La caché y el *debounce* lo contienen, y al agotarse la aplicación sigue funcionando sin IA. Para la defensa: no encadenar creaciones de ticket, o apagar `suggestArea` en Configuración | F5 ✓ |
| Google retira nombres de modelo | `GEMINI_MODEL` se cambia en el `.env` sin tocar código; el 404 dice cuál usar | F5 ✓ |
| Falla el equipo de la presentación | Ensayo completo en esa máquina con antelación | F8 |

---

## 11. Decisiones pendientes

Heredadas de `PRODUCT.md`:

- **Logo definitivo** (hoy hay un logotipo tipográfico provisional).
- **Promedio anónimo del área** en los reportes de empleados: ¿se muestra?
- **Compartir reportes guardados** entre usuarios: ¿entra en Fase 1?

Nuevas, que este plan necesita cerrar en F0:

- Los 7 desajustes de contrato de [§1.4](#14-desajustes-de-contrato-que-hay-que-resolver-antes-de-escribir-el-backend) — en especial **no adoptar shadcn/ui** y mantener los componentes propios.
- Gestor de paquetes del monorepo: workspaces de npm (ya hay `package-lock.json` en `apps/web`).
- Fecha real de la defensa, para fijar el punto de corte del [Plan B](#7-plan-b-orden-de-recorte).

---

## 12. Arranque inmediato

Los primeros pasos, en orden, sin ambigüedad:

1. Crear `package.json` raíz con workspaces y mover `apps/web` dentro del espacio de trabajo.
2. Crear `packages/shared` y migrar `apps/web/src/data/types.ts` a Zod, **resolviendo los 7 desajustes de §1.4**.
3. Instalar MongoDB Community y comprobar que `/api/v1/health` reporta `db: connected`.
4. Crear `apps/api` con `GET /api/v1/health` y el middleware de validación Zod.
5. Escribir el **motor de SLA** con sus pruebas, antes que cualquier endpoint: es la pieza más barata de hacer bien ahora y la más cara de arreglar después.

---

*Documento vivo. Al cerrar cada fase, actualizar el estado en [§1](#1-punto-de-partida-real) y revisar el punto de corte del Plan B.*
