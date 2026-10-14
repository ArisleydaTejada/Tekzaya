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
- ~~**Reportes**~~ — migrada por completo: plantillas, constructor de gráficas, reportes guardados y lista de tickets del período.
- ~~**Administración**~~ — migrada por completo: Usuarios, Áreas y categorías y Configuración.
- **Sin `GEMINI_API_KEY`, no hay IA** — y es un modo de funcionamiento previsto, no una carencia: el ticket entra con prioridad *Media* y queda `pending`, listo por si algún día se pone la clave.

> `mock.ts` y `types.ts` **ya no existen**: desaparecieron con la última página
> migrada (Reportes, F7), tal como estaba previsto. No queda ningún punto de
> traducción entre los enumerados del prototipo y el contrato.

**Ya no es simulado:** sesión y permisos (F2); tickets, conversación, SLA,
adjuntos e historial (F3); asignación, transferencias, fusión de duplicados,
trabajos programados y administración completa (F4); las cinco funciones de
IA (F5); tablero, notificaciones, tiempo real, CSAT y exportación CSV (F6); y
reportes personalizables con su lista de tickets y sus exportaciones (F7).
**Ninguna pantalla importa datos simulados.**

### 1.3 Lo que no existe en absoluto

Nada del plan. Lo último que faltaba, las pruebas de punta a punta, entró en F8.

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
>
> **Cerrado en F7:** el catálogo de 35 medidas y 13 dimensiones, el constructor con sus doce tipos de gráfica, trece plantillas repartidas por rol, los reportes guardados, la lista de tickets del período con filtros avanzados y columnas, y las exportaciones CSV, PDF y PNG. 248 pruebas en total.
>
> **Cerrado en F8:** los 5 recorridos de la defensa en Playwright, la auditoría de accesibilidad con axe en los dos temas y a 360 px, la medición con 10 000 tickets (las 15 mediciones dentro del §13), el README de instalación y un trabajo de E2E en CI. 295 pruebas de Vitest y 37 de Playwright.

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

### F7 · Reportes personalizables — *hecha*

La pieza más grande y la que el spec ya señala como candidata a recorte (§16). Se construyó en este orden, y cada escalón es entregable por sí solo:

1. `GET /reports/catalog` filtrado por rol + **plantillas** con datos reales.
2. `POST /reports/query` con **revalidación de alcance en el servidor** y gráficas de barras, línea, dona y tabla.
3. `GET /reports/tickets` y `/reports/tickets/export`: lista con filtros avanzados, columnas configurables y CSV.
4. `GET|POST|PUT|DELETE /reports` y `POST /reports/:id/duplicate`: reportes guardados (pestañas *Mis reportes* y *Nuevo*, antes vacías).
5. Exportación: CSV en el servidor, PDF y PNG en el navegador.
6. **No sobró tiempo, entró igual:** radar, mapa de calor, barra segmentada, semidona y comparación con el período anterior.

**DoD:** un empleado que manipule el `userId` o el `areaId` del payload recibe **403**, con prueba automatizada que lo demuestra **para los 4 roles** (`reports.test.ts`, bloque *alcance revalidado en el servidor*): se prueban los cuatro alcances pedidos a mano en el payload, el `areaId` de un filtro de gráfica, el término de comparación, la lista de tickets y el CSV. **Verificado también en el navegador**: el empleado no ve siquiera el selector de alcance (solo tiene "Yo"), sus plantillas son las tres personales y sus KPI miden solo lo suyo; el supervisor recibe `Mi área | Una persona de mi área | Yo`, y el administrador, las cuatro opciones y la comparativa entre áreas. Además se barrieron **las 35 medidas contra las 13 dimensiones** sobre los datos semilla (455 combinaciones, más las segmentadas y las comparadas): dos reventaban y están corregidas y cubiertas con prueba —agrupar por tiempo una medida anclada en el historial, y preguntar por los responsables de un ticket ya partido por responsable—. 250 pruebas en total.

Decisiones tomadas al ejecutarla:

- **Cada medida se mide sobre su propia ventana.** "Resueltos este mes" son los que se resolvieron dentro de la ventana, no los que se crearon en ella; el mismo ticket puede contar en enero para una medida y en marzo para otra (spec §9). Cada medida declara su *ancla* y la gráfica junta después las filas por la clave del grupo: eso es lo que permite dibujar "recibidos frente a resueltos" en la misma gráfica sin que ninguna de las dos series mienta.
- **El catálogo de lo posible vive en `packages/shared`.** El panel deshabilita las opciones incompatibles con la misma función (`validateWidget`) con la que el servidor responde 422. Si la regla viviera dos veces, la interfaz ofrecería combinaciones que la API rechaza, que es exactamente lo que el spec §7.8.3 pide evitar.
- **El radar solo admite porcentajes y el CSAT.** Normalizar un recuento a "0–100 donde más lejos es mejor" exigiría inventarse un techo; con porcentajes la normalización es exacta y la gráfica no miente sobre una escala que no existe.
- **Los totales no se suman de las filas.** Una media de medias no es la media y un porcentaje por persona no se promedia: el total se vuelve a medir sin dimensión. Por lo mismo, **«Otros» solo suma recuentos** y se queda sin valor cuando la medida es un porcentaje o un tiempo.
- **El alcance de la lista no es el de las gráficas.** Un empleado ve **todos los tickets de su área** —puede leer esas conversaciones por la regla del §7.5— aunque sus gráficas sigan siendo solo suyas (spec §7.8.9). Es la única excepción, y solo para quien no tiene elección: si un supervisor elige "Yo", su lista también se acota.
- **RRHH ve la ficha de todas las áreas, no su conversación.** Cada fila viaja con un `readable` resuelto por el motor de permisos; el número solo es un enlace cuando se puede abrir, y el endpoint de detalle vuelve a comprobarlo.
- **Los filtros de tiempo se miden en horas laborales**, que Mongo no sabe calcular. Cuando hay uno activo, la consulta trae hasta el techo de 10 000 filas del §7.8.9, calcula con el motor de F1 y pagina arriba. Es más caro y es lo correcto: un "más de 8 horas" medido con reloj de pared contaría las noches.
- **El alcance guardado se revalida al abrir, no al guardar** (spec §7.8.1). Un reporte que guardó un supervisor y abre alguien que dejó de serlo no falla: se abre recortado a lo que su rol permite hoy (`effectiveScope`, `scopeNarrowed`) y la pantalla lo avisa. Se guarda lo que se **pidió**, para que recuperar el rol devuelva el reporte completo sin rehacerlo.
- **El atraso se reconstruye con fechas, no con el estado de hoy**: creado antes del corte y sin resolución, cierre, cancelación ni fusión anteriores a él. Así "pendientes en marzo" sigue siendo cierto consultado en junio.
- **El PNG sale del SVG de la gráfica y el PDF, de la impresión del navegador**, en vez de `html2canvas` + `jsPDF` como preveía el plan. Recharts ya dibuja en vectores: rasterizar el DOM daría una copia peor de algo que no hace falta copiar, y por el camino añadiría dos dependencias pesadas. En el PDF, además, el texto sigue siendo texto.
- **El CSV de las gráficas va en un archivo con un bloque por gráfica**, no en un `.zip` con un archivo cada una: el `.zip` obligaría a añadir una dependencia de compresión para que Excel enseñe exactamente lo mismo.
- **Los duplicados fusionados quedan fuera de las métricas pero sí salen en la lista.** Son histórico, y la lista del §7.8.9 incluye todos los estados. Por eso la tabla puede mostrar más tickets que la KPI "creados": la diferencia son justo los fusionados.
- **Los límites los fija el administrador** (`settings.reportLimits`: reportes guardados por persona y gráficas por reporte, spec §7.7), y se aplican en el servidor al guardar, no en la pantalla.
- **Pulsar una barra o una porción filtra la lista** (spec §7.8.2). Las dimensiones sin filtro equivalente —el tiempo, el resultado de la IA— no hacen nada en vez de llevar a una lista que no corresponde con lo que se pulsó.

Quedó fuera, y se dice para no buscarlo después: **arrastrar y redimensionar** las tarjetas en modo edición (el tamaño se elige en el panel: un tercio, media o ancho completo) y las **vistas de filtros con nombre** independientes del reporte (los filtros se guardan con el reporte, que es lo que el §7.8.9 pide primero).

---

### F8 · Endurecimiento, demo y entrega — *hecha*

- **E2E con Playwright** de los 5 recorridos de la defensa (`e2e/`, `npm run test:e2e`).
- **Rendimiento:** cargar 10.000 tickets de prueba y verificar los umbrales del §13 (`npm run perf`).
- **Accesibilidad:** contraste AA, recorrido por teclado, prioridad nunca solo por color, 360 px.
- Pendientes de diseño de `ajustes.md`: ya estaban cerrados (logos, colores de marca y barra lateral con tema, commit `796550f`).
- Guía de instalación local (`README.md`), `.env.example` final, semilla de demostración reproducible.
- **Ensayo completo en el equipo de la presentación**, incluyendo el modo sin IA: *pendiente*, es lo único que no se puede hacer desde aquí. La lista está en [`PRESENTACION.md` §13](PRESENTACION.md#13-ensayo-en-el-equipo-de-la-presentación).

**DoD:** un evaluador clona el repositorio y llega a la aplicación con datos en menos de 10 minutos siguiendo el README. **Medido** con una copia limpia de los archivos del repositorio, sin `node_modules`, siguiendo el README al pie de la letra: `npm ci` 28 s, `npm run seed` 3 s y `npm run dev` listo en 4 s, con `/health` en `db: connected` y el inicio de sesión del empleado devolviendo sus tickets. Menos de un minuto de máquina; la descarga de dependencias en un equipo sin caché de npm añade un par de minutos.

**Los cinco recorridos** (`e2e/01…05`), cada uno con su porqué:

| # | Recorrido | Qué demuestra |
|---|---|---|
| 1 | Acceso | Sin sesión no se entra (ni a la pantalla ni a la API); la contraseña mal escrita se explica sin decir si la cuenta existe; cerrar sesión cierra de verdad |
| 2 | Ciclo del ticket, entre dos sesiones | Crear sin IA → tomar → responder → nota interna → resolver con nota → el solicitante lee la solución y **no** la nota, tampoco por la API → CSAT una sola vez |
| 3 | Kanban | Arrastrar persiste tras recargar, una transición prohibida vuelve atrás con aviso, y **con teclado** también se mueve |
| 4 | Tiempo real | Con dos sesiones, crear un ticket sube el tablero del supervisor y su campana sin recargar |
| 5 | Reportes por rol | Cada rol ve solo sus alcances, las plantillas pintan, y un alcance forzado en el payload da 403 |

**Rendimiento con 10.000 tickets** (19.260 mensajes), la peor de cinco vueltas en caliente, con la primera en frío aparte:

| Medición | Peor | Límite |
|---|---|---|
| Tablero, todas las áreas, año | 127 ms | 2 s |
| Bandeja de tickets con sus seis pestañas | 68 ms | 2 s |
| Bandeja ordenada por solicitante (la más cara) | 841 ms | 2 s |
| Gráficas de reporte (cinco tipos, incluida la comparación) | 95–273 ms | 3 s |
| Lista del período con filtro en horas laborales | 499 ms | 2 s |
| CSV del período, todo el año | 502 ms | 5 s |

Decisiones tomadas al ejecutarla:

- **Las E2E corren contra su propia API, su propia web y su propia base** (`tekzaya_e2e`, puertos 4100 y 5174), sembrada en el mismo comando que arranca la API. Se pueden lanzar con la demo abierta, y nunca dependen de lo que alguien haya tocado a mano.
- **La API de las E2E arranca sin clave de Gemini.** Así cada recorrido prueba a la vez el producto y el modo sin IA, que es el respaldo de la defensa: si un cambio hiciera depender algo de la IA, se rompería aquí y no delante del tribunal.
- **Los selectores son de rol y de etiqueta, no de clase CSS.** Escribirlos destapó controles sin nombre accesible (el selector de estado, el redactor, el filtro de alcance de Reportes…): si una prueba no puede encontrar un control por su nombre, un lector de pantalla tampoco. Se arreglaron en la interfaz, no en la prueba.
- **axe audita las pantallas principales en los dos temas** y falla con una línea por elemento. Encontró 104 problemas de contraste, casi todos del mismo origen: el verde, el ámbar y el rojo de estado eran fijos, pensados para fondo oscuro, y como texto sobre blanco se quedaban entre 1,7:1 y 3,9:1. Ahora dependen de la superficie (`@theme inline` + `--status-*`) y pasan AA también sobre su propio tinte. El primario como texto tenía el problema inverso en oscuro (2:1) y pasa a `text-accent-ink`, que allí lee el lila. La plancha del login es clara en los dos temas y fija sus tonos con `data-surface="light"`.
- **El Kanban se puede usar con teclado.** Solo tenía sensor de puntero. Ahora Espacio levanta la tarjeta, las flechas saltan de columna en columna (no 25 px por pulsación) y los anuncios para lector de pantalla están en español. La tarjeta dejó de ser un botón que contenía un enlace: se arrastra desde su número.
- **Los mensajes de error llegan con etiquetas, no con enumerados.** El rechazo de una transición decía "Un ticket in_progress no puede pasar a open"; ahora dice «En progreso» y «Abierto». Lo destapó el recorrido del Kanban.
- **La medición siembra su propia base y clona la semilla** con fechas repartidas en un año (lo vivo, en los últimos diez días) y generador de semilla fija. Mide por HTTP lo que pide cada pantalla, en paralelo como lo hace el navegador, y sale con código 1 si algo se pasa: sirve para CI.
- **La primera medición falló, y por un motivo que valía la pena.** La lista del período con un filtro de horas laborales tardaba 3,4 s. El motor de SLA calculaba la jornada de cada día con seis llamadas a `Intl`, y lo repetía por cada ticket: 10 000 tickets recorrían los mismos pocos cientos de días una y otra vez. Una caché por día y zona horaria en `businessTime.ts` la dejó en 0,5 s, y de paso bajó el CSV del período de 3,4 s a 0,5 s y el tablero global de 376 a 127 ms. Es una función pura con entradas finitas: memoizarla no cambia ningún resultado, y las 87 pruebas del motor lo confirman.
- **Una antigüedad que no paraba de crecer.** La misma investigación encontró que la columna `ageHours` medía los tickets cancelados hasta hoy, porque no tienen fecha de resolución. Un cancelado hace un año "envejecía" cada día y obligaba a recorrer 365 días de calendario. Ahora solo envejece lo que sigue vivo, con prueba.
- **La exportación CSV de la bandeja sigue con techo de 5 000 filas**, como se decidió en F6: por encima de eso la herramienta es la lista del período de Reportes, que llega a 10 000 y es la que se mide contra el umbral del §13.
- **La semilla es reproducible, no congelada en el calendario.** El generador tiene semilla fija, pero las fechas se calculan desde el momento de sembrar. Si se congelaran, los tickets "en riesgo" del día de la grabación estarían vencidos el día de la defensa. Se siembra la mañana de la presentación.

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
| Exportación CSV | F6 ✓ (tickets/tablero) → F7 ✓ (reportes) |
| Reportes personalizables, guardados, plantillas | F7 ✓ |
| Exportación PDF | F7 ✓ |
| Administración: usuarios, áreas, categorías, SLA | F4 ✓ |
| Invitaciones y restablecimiento de contraseña | F4 ✓ (previsto en F2) |
| Requisitos no funcionales §13 | F8 ✓ |
| Fase 2 (activos) | Módulo 2, fases A0–A7 — ver [§13](#13-módulo-2-mantenimiento-de-activos) |

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
| 11–12 | F7 — *hecha* (los seis escalones) |
| 12 | F8 — *hecha* (falta el ensayo en el equipo de la presentación) |

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
| Alcance de reportes | Supertest: payload manipulado → 403, por rol | F7 ✓ |
| Combinaciones de gráfica imposibles | Vitest sobre `validateWidget`, la misma función que usa el panel | F7 ✓ |
| Medidas contra una cuenta escrita aparte | Supertest: creados, resueltos, fusionados fuera, porcentaje sin denominador | F7 ✓ |
| Filtros y columnas de la lista del período | Supertest: número, estado, texto, horas laborales y CSV sin conversación | F7 ✓ |
| Reporte guardado que pierde alcance | Supertest: se abre recortado, no falla | F7 ✓ |
| Recorridos de la defensa | Playwright E2E, contra una API sin clave de IA | F8 ✓ |
| Accesibilidad | axe (WCAG 2.1 AA) en las pantallas principales, en los dos temas, y desborde a 360 px | F8 ✓ |
| Kanban con teclado | Playwright: Espacio, flecha y Espacio mueven la tarjeta y el cambio persiste | F8 ✓ |
| Rendimiento con 10.000 tickets | `npm run perf`: semilla de carga + medición contra §13, sale con 1 si algo se pasa | F8 ✓ |
| Antigüedad de tickets cerrados | Supertest: un cancelado no tiene `ageHours` | F8 ✓ |

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
| La demo depende de internet (Gemini y Google) | Modo sin IA probado + login por correo como respaldo; toda la suite E2E corre sin IA | F5 ✓, F8 ✓ |
| **El plan gratuito de Gemini permite 5 peticiones por minuto** | Medido con la clave real: escribir en el formulario de nuevo ticket puede agotarlo en segundos. La caché y el *debounce* lo contienen, y al agotarse la aplicación sigue funcionando sin IA. Para la defensa: no encadenar creaciones de ticket, o apagar `suggestArea` en Configuración | F5 ✓ |
| Google retira nombres de modelo | `GEMINI_MODEL` se cambia en el `.env` sin tocar código; el 404 dice cuál usar | F5 ✓ |
| Reportes lentos con muchos tickets (spec §16) | Una consulta por gráfica, con su propio esqueleto de carga; techo de grupos por gráfica y de 10 000 filas por lista; caché por día en el motor de horas laborales. Medido con 10 000 tickets: nada pasa de 0,85 s | F7 ✓, F8 ✓ |
| Falla el equipo de la presentación | Ensayo completo en esa máquina con antelación, con la lista de `PRESENTACION.md` §13 | F8 (pendiente) |

---

## 11. Decisiones pendientes

Heredadas de `PRODUCT.md`:

- **Logo definitivo** (hoy hay un logotipo tipográfico provisional).
- **Promedio anónimo del área** en los reportes de empleados: ¿se muestra? *(Sigue abierta: hoy un empleado solo ve sus propios números.)*
- ~~**Compartir reportes guardados** entre usuarios~~ — **cerrada en F7: no.** Los reportes son personales (spec §7.8.1). Compartirlos abriría una vía para que alguien viera, a través del reporte de otro, datos fuera de su alcance; y mientras no se compartan, filtrar por dueño basta para que eso no pueda ocurrir.

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

## 13. Módulo 2: mantenimiento de activos

> El plan completo, con el modelo de datos, los permisos, el DoD de cada fase y las pruebas, está en **[`PLAN_MODULO2_ACTIVOS.md`](PLAN_MODULO2_ACTIVOS.md)**. Aquí va el resumen.

**Alcance** (spec §14): inventario de activos, historial, averías desde tickets, órdenes de trabajo con costo, mantenimiento preventivo, repuestos con stock mínimo, alertas, reportes MTBF/MTTR/disponibilidad e IA para fallas recurrentes.

**Decisiones de partida:**

- **Cada activo tiene un área responsable** (TI mantiene laptops, Mantenimiento el aire acondicionado). Reutiliza áreas, supervisores y el motor de permisos del módulo 1.
- **La orden de trabajo es una entidad aparte (`OT-0001`) vinculada al ticket.** El ticket conserva su SLA y su conversación; la OT lleva horas, repuestos y costo, y también puede nacer de un preventivo sin ticket.
- **Moneda configurable por el admin, USD por defecto.** Los montos se guardan en centavos enteros y cambiar la moneda no convierte los montos antiguos.
- **MTBF, MTTR y disponibilidad se miden en horas laborables**, con el mismo motor que el SLA.
- **La IA no inventa cifras:** los números salen del historial y el modelo solo elige casos parecidos y redacta la explicación.

| Fase | Contenido | Duración |
|---|---|---|
| A0 | Contratos Zod, modelos, permisos ampliados con pruebas, semilla con 12 meses de historial | 0,5 sem |
| A1 | Inventario: lista, ficha, foto, línea de tiempo, baja | 1 sem |
| A2 | "Vincular un equipo" al crear ticket, convertir ticket en OT | 1 sem |
| A3 | Órdenes de trabajo: estados, horas, repuestos, costo, tiempo de parada | 1,5 sem |
| A4 | Repuestos: stock como libro de movimientos, sin negativos, alerta de mínimo | 1 sem |
| A5 | Preventivos recurrentes (`fixed` / `from_last`) generados por un trabajo diario | 1 sem |
| A6 | Panel de mantenimiento, alertas, fuente `maintenance` en el constructor de reportes | 1 sem |
| A7 | IA (reparar o reemplazar, estimación de costo), E2E, rendimiento, entrega | 1 sem |

**Total: ~8 semanas.** Hito de seguridad al cerrar A3 (semana ~5): inventario, averías desde tickets y órdenes con costo ya forman un módulo defendible.

**Nunca se recorta:** inventario con historial, permisos por área responsable, vínculo ticket → activo → OT, costo de la OT, stock sin negativos y preventivos que generan OT.

---

*Documento vivo. Al cerrar cada fase, actualizar el estado en [§1](#1-punto-de-partida-real) y revisar el punto de corte del Plan B.*
