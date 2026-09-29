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

Esto es deuda, no producto. Todo vive en `apps/web/src/data/mock.ts` (22 tickets):

- **No hay sesión.** El login navega; no autentica. `CURRENT_USER` es una constante.
- **No hay permisos.** El rol se lee de una constante; nada se valida.
- **La "IA" son palabras clave.** `suggestArea()` / `suggestPriority()` en `CreateTicketPage.tsx` son `if` sobre substrings. El autocompletado con Tab es texto fijo.
- **El SLA es un dato escrito a mano.** `slaResponse` / `slaResolution` vienen precocinados en el mock; no se calcula nada.
- **Las mutaciones se pierden al recargar.** Las páginas **mutan el array importado** (p. ej. `dup.status = "fusionado"` en `TicketDetailPage.tsx`) y fuerzan un re-render. No hay persistencia ni capa de datos.
- **Reportes:** solo la pestaña Plantillas tiene contenido; *Mis reportes* y *Nuevo* son estados vacíos.

### 1.3 Lo que no existe en absoluto

`apps/api`, `packages/shared`, MongoDB, autenticación (JWT/Google), Socket.IO, Gemini, jobs programados, adjuntos, pruebas, CI, `.env.example`, script de semilla, y **`package.json` raíz** (hoy `apps/web` es un proyecto suelto, no un monorepo).

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

### F0 · Fundaciones del monorepo y contratos — *1 semana*

**Objetivo:** que exista un esqueleto ejecutable y un contrato de tipos compartido.

- `package.json` raíz con workspaces npm; `tsconfig` base; `.gitignore` raíz; `.env.example` documentado.
- `packages/shared`: migrar `apps/web/src/data/types.ts` a esquemas **Zod** resolviendo los 7 desajustes de [§1.4](#14-desajustes-de-contrato-que-hay-que-resolver-antes-de-escribir-el-backend).
- `apps/api`: Express + TypeScript, cargador de configuración, manejador de errores, middleware de validación Zod, `GET /api/v1/health`.
- MongoDB Community instalado en el equipo como servicio de Windows. *(Decidido: sin Docker. La cadena de conexión es lo único que cambia si más adelante se pasa a Atlas.)*
- CI (GitHub Actions): typecheck + lint + test en cada push.

**DoD:** `npm run dev` en la raíz levanta web + API; `/api/v1/health` responde y reporta `db: connected`; `apps/web` importa un tipo desde `packages/shared` y compila.

---

### F1 · Modelo de datos, semillas y motor de SLA — *1,5 semanas*

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

### F3 · Tickets núcleo y conversación — *2,5 semanas*

**Objetivo:** el corazón del producto, sin IA y sin tiempo real.

`GET /tickets` (filtros, orden, paginación, `scope=mine|assigned|area|unassigned|all`), `POST /tickets` (incl. `requesterId` de un compañero del área), `GET /tickets/:id`, `PATCH /tickets/:id` (estado, categoría, prioridad con motivo), `GET|POST /tickets/:id/messages`, `POST /attachments`.

- **Filtrado de notas internas en la consulta**, nunca en el cliente (§10.4).
- Historial de cambios (`statusHistory`, mensajes de sistema) desde el primer día: la auditoría es requisito no funcional (§13).
- Adjuntos en disco fuera del directorio público, servidos por endpoint protegido, validando MIME real y tamaño.

Frontend migrado: `TicketsPage` (Lista y Grupos), `CreateTicketPage`, `TicketDetailPage`.

**DoD:** crear → conversar → resolver funciona de extremo a extremo sin mock; existe una prueba que verifica que **el solicitante no recibe notas internas** ni siquiera perteneciendo al área destino.

---

### F4 · Asignación, ciclo de vida y trabajos programados — *2 semanas*

**Objetivo:** que el ticket se mueva solo y en equipo.

`PUT /tickets/:id/assignees`, `POST /take`, `/join-request`, `/transfer`, `/merge`, `/unmerge`, `GET /duplicate-candidates`, `GET /areas/:id/workload`, `GET /areas/:id/members`.

- **Jobs (node-cron):** recálculo de estados de SLA, auto-cierre de *Resuelto* a los 3 días hábiles, recordatorio de *En espera* a los 5 días y cierre a los 10.
- **Kanban persistente:** soltar una tarjeta emite `PATCH` y revierte visualmente si el backend rechaza la transición.
- Transferencia devuelve a *Abierto* sin responsables y queda en historial.

**DoD:** arrastrar en Kanban persiste tras recargar; un ticket pasa solo a *En riesgo* y a *Vencido*; fusionar y deshacer la fusión funciona conservando el historial.

---

### F5 · Inteligencia artificial con degradación elegante — *1,5 semanas*

**Objetivo:** el diferenciador del producto, sin que pueda tumbar la demo.

`POST /ai/suggest-area`, `/ai/tickets/:id/summary`, `/ai/autocomplete`, `/ai/tickets/:id/incident`, `POST /tickets/:id/incident/dismiss`.

- `AIService` con Gemini (`@google/genai`), salida JSON estructurada, **caché**, límite por usuario, tiempo máximo (autocompletado se descarta a los 1,5 s) y cola de reintentos para la clasificación asíncrona.
- Interruptores por función en `settings.aiEnabled`.
- Sustituye las heurísticas de `CreateTicketPage.tsx` y el fantasma fijo del redactor.

**DoD:** **con `GEMINI_API_KEY` vacía, la aplicación completa sigue siendo usable** (se crea el ticket, con área elegida a mano y prioridad por defecto); la sugerencia de área aparece en menos de 2 s con la clave puesta.

**Riesgo que retira:** *se agota la cuota gratuita durante la demo* — probado, no supuesto.

---

### F6 · Tiempo real, tableros, notificaciones, CSAT y CSV — *2 semanas*

`GET /stats/overview`, `/stats/timeseries`, `/by-person`, `/by-category`, `/stats/export?format=csv`, `GET|PATCH /notifications`, `POST /tickets/:id/csat`, `GET /tickets/export`.

- Socket.IO con salas por usuario, área y ticket: `notification:new`, `ticket:updated`, `ticket:message`.
- Tableros de los 4 roles alimentados por agregaciones reales.
- Encuesta CSAT al resolver.

**DoD:** con dos navegadores abiertos, un cambio en uno aparece en el otro en menos de 1 s; los KPI del tablero cuadran con una consulta manual a la base.

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
| SLA con horario laboral y pausas | F1 (motor) → F4 (jobs y alertas) |
| Asignación múltiple, carga, Tomar/Unirme | F4 |
| Transferir entre áreas | F4 |
| Fusión de duplicados y deshacer | F4 |
| Kanban persistente | F4 |
| IA: sugerir área, clasificar, resumir, autocompletar, incidentes | F5 |
| Notificaciones en tiempo real | F6 |
| Tableros por rol (4 KPI, sin gráficas) | F6 |
| CSAT | F6 |
| Exportación CSV | F6 (tickets/tablero) → F7 (reportes) |
| Reportes personalizables, guardados, plantillas | F7 |
| Exportación PDF | F7 |
| Administración: usuarios, áreas, categorías, SLA | F2 (usuarios) → F4 (SLA) |
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
| 1 | F0 |
| 2–3 | F1 |
| 3–5 | F2 |
| 5–7 | F3 |
| 7–9 | F4 |
| 9–10 | F5 |
| 10–11 | F6 |
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
| Motor de SLA (horario, pausas, festivos, reapertura) | Vitest, función pura, casos borde exhaustivos | F1 |
| Matriz de permisos §4.3 | Supertest, **una prueba por fila**, los 4 roles | F2 |
| Filtrado de notas internas | Supertest: el solicitante del área destino **no** las recibe | F3 |
| Transiciones de estado inválidas | Supertest: rechazo con 409 | F4 |
| Degradación sin IA | Suite con `GEMINI_API_KEY` vacía | F5 |
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
| La demo depende de internet (Gemini y Google) | Modo sin IA probado + login por correo como respaldo | F5, F8 |
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
