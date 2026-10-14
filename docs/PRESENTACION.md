# Tekzaya — Guía para la presentación

Guía rápida con lo que el profesor podría preguntar. Cada sección es corta a propósito.

---

## 1. ¿Qué es Tekzaya?

Plataforma web de **soporte interno por tickets con IA**. Un empleado reporta un problema, la IA sugiere a qué área va (TI, Mantenimiento, Ventas…) y qué prioridad tiene, y el supervisor del área lo asigna a un técnico. El sistema mide los **tiempos de atención (SLA)**, avisa en **tiempo real** y genera **reportes personalizables**.

*(La idea completa incluye un segundo módulo de mantenimiento de activos; esta primera fase es solo el de tickets.)*

**Roles:**
- **Empleado**: crea tickets y ve los suyos.
- **Supervisor de área**: ve y asigna los tickets de su área, y sus estadísticas.
- **Supervisor de RRHH** (acceso global de lectura) y **Administrador**: ven todas las áreas; el admin además configura el sistema y los usuarios.

En el código no hay un rol por cada caso: hay dos roles base (`employee`, `admin`) más **banderas** (`isAreaSupervisor`, `hasGlobalReadAccess`). Así se combinan sin multiplicar roles.

---

## 2. Tecnologías

Es un **monorepo** (npm workspaces) con tres paquetes, todo en **TypeScript**:

| Paquete | Qué es | Tecnologías |
|---|---|---|
| `apps/web` | Interfaz (frontend) | React 19, Vite, Tailwind CSS 4, React Router, **Recharts** (gráficas), Motion (animaciones), socket.io-client |
| `apps/api` | Servidor (backend) | Node.js 20+, **Express 5**, **MongoDB + Mongoose**, Socket.IO, node-cron, JWT, bcryptjs, Multer |
| `packages/shared` | Código compartido | **Zod** (validaciones), tipos, permisos y cálculo del SLA |

Otras piezas:
- **IA**: Google **Gemini** (`@google/genai`, modelo `gemini-3.5-flash-lite` configurable por variable de entorno).
- **Login**: correo/contraseña **y** Google (restringido a un dominio de la empresa).
- **Pruebas**: Vitest + Supertest (unitarias e integración), **Playwright** + axe (recorridos de punta a punta y accesibilidad). **Linter**: oxlint.

**¿Por qué un paquete `shared`?** Para que el frontend y el backend usen *exactamente* las mismas reglas (permisos, validaciones, SLA). Si se escribieran dos veces, tarde o temprano se contradirían.

**¿Por qué MongoDB?** Un ticket es un documento con datos anidados (SLA, adjuntos, CSAT, responsables) y esquema flexible; encaja mejor que tablas relacionales, y las agregaciones de Mongo sirven para los reportes.

---

## 3. Arquitectura en una frase

El navegador (React) llama a una **API REST** (`/api/v1/...`) en Express, que lee y escribe en MongoDB. Además hay un canal **WebSocket** (Socket.IO) para avisos en vivo y **trabajos programados** (cron) que vigilan los plazos.

El backend está dividido por módulos: `tickets`, `auth`, `ai`, `reports`, `stats`, `notifications`, `admin`, `attachments`, etc. Cada ruta valida su entrada con Zod, exige sesión y aplica permisos.

---

## 4. Seguridad

- **Autenticación**: JWT en **cookies `httpOnly`** (el JavaScript de la página no puede leerlas). Access token de 15 min y refresh token de 7 días.
- **Contraseñas**: hasheadas con **bcrypt**. Tras 5 intentos fallidos la cuenta se bloquea 15 min.
- **Autorización**: motor de permisos en `shared/permissions` (¿puede ver este ticket? ¿leer notas internas? ¿reasignar? ¿fusionar?). Se aplica **en el servidor**; ocultar un botón en la interfaz no sustituye eso.
- **Alcance de reportes**: el servidor lo decide en cada consulta según la sesión. Un reporte guardado guarda lo que se pidió, **nunca un permiso**.
- **Adjuntos**: se guardan fuera de lo que sirve el servidor web y solo se descargan por un endpoint protegido.
- **IA**: el texto del usuario se encierra entre marcas y se trata como *datos* (defensa contra "ignora las instrucciones anteriores"); además la respuesta se **valida contra un esquema Zod**.

---

## 5. Ciclo de vida del ticket

Estados: `Abierto → Asignado → En progreso → En espera → Resuelto → Cerrado`, más `Reabierto`, `Cancelado` y `Fusionado`.

- Solo hay transiciones permitidas (una tabla en `ticket.lifecycle.ts`).
- **Resuelto → Cerrado** solo, tras X días hábiles sin respuesta del solicitante.
- **En espera** (esperando al solicitante): manda recordatorio y, pasado el plazo, cierra automáticamente.
- **Fusión de duplicados**: varios tickets del mismo problema se unen bajo uno principal.
- **Detección de incidentes**: la IA agrupa tickets parecidos en una ventana de tiempo (p. ej. "caída del wifi en Ventas").
- Al terminar, el solicitante puede dar una calificación **CSAT** (satisfacción).

---

## 6. ¿Cómo se calcula el SLA?

**SLA** = acuerdo de nivel de servicio: el tiempo máximo para **responder** y para **resolver** un ticket, según su prioridad. Cada ticket tiene **dos relojes**.

**Plazos por defecto** (el administrador los edita):

| Prioridad | Primera respuesta | Resolución |
|---|---|---|
| Urgente | 15 min | 4 h |
| Alta | 1 h | 8 h |
| Media | 4 h | 24 h |
| Baja | 8 h | 72 h |

**Clave: se cuenta en tiempo laborable**, no en tiempo de pared. Por defecto lunes a viernes, 08:00–18:00 (10 h/día), con una **zona horaria única de la empresa** (`America/La_Paz`) y una lista de **festivos**. Las noches, fines de semana y festivos no cuentan.

**Fórmula:**
- `vence = creación + plazo` sumando solo minutos laborables (`addBusinessMinutes`).
- `en riesgo = creación + 75 % del plazo` (también en minutos laborables).

**Estados:** `En tiempo` → `En riesgo` (consumió el 75 %) → `Vencido` (pasó el límite).

**Ejemplo:** ticket de prioridad Media creado el lunes a las 16:00.
- Respuesta (4 h = 240 min): lunes 16:00–18:00 son 2 h; faltan 2 h, que se cumplen el martes a las 10:00. Vence el **martes 10:00** (en riesgo a las 09:00).
- Resolución (24 h = 1440 min): llega hasta el **jueves 10:00**.

**Detalles importantes:**
1. **Los umbrales se calculan una vez al crear el ticket** y se guardan en el documento. Así, listar o reportar solo compara fechas y es rápido, aunque haya muchos tickets.
2. **Pausa en "En espera"**: cuando el ticket sale de ese estado, el vencimiento se corre tantos minutos laborables como duró la pausa (`shiftTargets`). El tiempo que se espera al solicitante no cuenta en contra del equipo.
3. **El reloj se congela** al dar la primera respuesta (reloj de respuesta) o al resolver. Un ticket respondido a tiempo no pasa a "vencido" después.
4. **La lista muestra el peor** de los dos relojes (`worstSlaState`).
5. **Un trabajo programado cada 10 min** (`sla.job.ts`) revisa los tickets vivos y **envía la notificación** la primera vez que uno entra en riesgo o vence (con una marca para no repetirla). También guarda `responseBreached` / `resolutionBreached`, porque "estaba vencido" no se puede recalcular después de resolver el ticket y los reportes lo necesitan histórico.

El cálculo vive en `packages/shared/src/sla/` (`sla.ts` y `businessTime.ts`) y tiene pruebas unitarias. Maneja zonas horarias con `Intl.DateTimeFormat`, incluidos los cambios de horario de verano.

---

## 7. La IA (Gemini)

Usos, cada uno activable/desactivable por el administrador:
1. **Sugerir área y categoría** al crear el ticket.
2. **Clasificar prioridad**.
3. **Resumen** del ticket para quien lo atiende.
4. **Autocompletar** respuestas (con Tab) y sugerencias para resolver.
5. **Detectar incidentes** (tickets duplicados o del mismo problema).

Decisiones de diseño:
- Una **interfaz `AiProvider`**: el resto del sistema no sabe que existe Gemini. Cambiar de proveedor es escribir otra implementación.
- **Nunca lanza errores**: si Gemini falla, tarda más de 8 s o devuelve algo inválido, devuelve `null` y la app sigue funcionando (la persona elige el área a mano).
- Cada respuesta incluye **confianza (0–1)**; la detección de incidentes solo actúa por encima de un mínimo configurable.
- **Caché en memoria + límite por persona**, porque la cuota gratuita de Gemini es pequeña.
- La IA **sugiere, no decide**: la persona puede corregirla, y esas correcciones alimentan las métricas de precisión de la IA.

---

## 8. Tiempo real y notificaciones

- **Socket.IO** con tres tipos de salas: por usuario, por área y por ticket. Así, un mensaje nuevo o un cambio de estado llega a quien corresponde sin recargar.
- El socket se autentica con la **misma cookie httpOnly** de la sesión.
- **Notificaciones** persistentes (campana): asignaciones, mensajes, SLA en riesgo / vencido, etc.

---

## 9. Reportes y gráficos

### Tablero (Dashboard)
Tarjetas de estadísticas arriba y gráficas abajo, que **cambian según el rol**:
- Empleado: sus tickets pendientes/resueltos/urgentes.
- Supervisor: su área (resueltos por persona, tiempo de respuesta, solicitudes por tipo…), con filtro por día/semana/mes/año. Solo ve su área.
- RRHH/Admin: todas las áreas, un área, una persona o ellos mismos.

### Reportes personalizables
Es un **constructor**: el usuario arma sus propios gráficos ("widgets") combinando tres cosas:

1. **Medidas** (qué se mide): creados, resueltos, backlog, tiempo de primera respuesta, tiempo de resolución, % cumplimiento de SLA, CSAT promedio, tasa de reapertura, precisión de la IA, carga por persona… (más de 30).
2. **Dimensiones** (cómo se agrupa): tiempo, categoría, prioridad, estado, estado de SLA, área, responsable, solicitante, CSAT, día×hora…
3. **Tipo de gráfica**: KPI, barras, barras horizontales, apiladas, línea, área, dona, semidona, segmentada, radar, mapa de calor y tabla.

Más filtros, rango de fechas y **comparación con el periodo anterior**.

### ¿Cómo funciona por dentro?
1. El frontend envía la **configuración del widget** (medidas + dimensión + gráfica + filtros + rango) al servidor.
2. El servidor valida que la combinación tenga sentido (p. ej. línea y área exigen dimensión de tiempo; un empleado no puede agrupar por "responsable").
3. Calcula el **alcance** según la sesión (yo / mi área / todas) y aplica ese filtro a la consulta.
4. Ejecuta **agregaciones de MongoDB**. Cada medida se calcula sobre *su* conjunto de tickets (los "resueltos del periodo" no son los "creados del periodo") y luego se unen las filas por la clave del grupo. Por eso se puede dibujar "recibidos vs. resueltos" en la misma gráfica sin que ninguna serie mienta.
5. Devuelve **filas ya agrupadas y etiquetadas**.
6. El frontend (`ReportChart.tsx`) **no calcula nada**: solo elige la forma con **Recharts**. Por eso la misma consulta puede pintarse como dona o como tabla sin tocar el backend.

Extras:
- **Clic en una barra o porción** → muestra los tickets de ese grupo (drill-down).
- **Reportes guardados** (con límite configurable) y **exportación** a CSV y de la gráfica como imagen.
- El catálogo (medidas, dimensiones, gráficas) vive en `shared`, así el servidor valida y el panel solo ofrece opciones válidas.

---

## 10. Otras funciones por si preguntan

- **Crear ticket en nombre de otra persona** (supervisores).
- **Disponibilidad**: un técnico "ausente" (vacaciones, permiso, incapacidad) deja de recibir asignaciones y vuelve solo (job horario).
- **Enlaces de acceso** para invitar usuarios.
- **Notas internas vs. públicas**: las internas no las ve el solicitante.
- **Tema claro/oscuro** y barra lateral.
- **Seed** (`npm run seed`) que carga áreas, categorías y usuarios de prueba.

---

## 11. Cómo se ejecuta

```bash
npm install
npm run seed       # datos iniciales
npm run dev        # arranca API (puerto 4000) y web (Vite, 5173) a la vez
npm test           # pruebas de api y shared (295)
npm run test:e2e   # los 5 recorridos y la accesibilidad, en Chromium
npm run perf       # 10 000 tickets en una base aparte, medidos contra el §13
```

Configuración en un `.env` en la raíz (Mongo, secretos JWT, Google client ID, clave de Gemini). La guía completa, con las cuentas, está en el `README.md`.

---

## 12. Preguntas que podrían hacerte

**¿Por qué el SLA no cuenta noches y fines de semana?**
Porque un ticket creado el viernes a las 17:55 no debería vencer el sábado: nadie trabaja. Medir en tiempo laborable hace la métrica justa.

**¿Por qué una sola zona horaria para el SLA?**
Si cada persona usara la suya, el mismo ticket vencería a horas distintas según quién lo mire. La zona de cada persona solo se usa para *mostrar* las fechas.

**¿Qué pasa si Gemini se cae?**
Nada grave: devuelve `null`, la persona elige el área a mano y el sistema sigue funcionando.

**¿Cómo evitas que un supervisor vea datos de otra área?**
El servidor calcula el alcance desde la sesión en cada consulta; el cliente no puede pedirse más permisos.

**¿Por qué recalcular el estado del SLA al leer en vez de guardarlo?**
Se guardan las *fechas* de vencimiento y riesgo (calculadas una vez); el estado es solo comparar con la hora actual. Lo único que se guarda como historial son los incumplimientos, porque no se pueden reconstruir después.

**¿Cómo agregarías otro tipo de gráfica?**
Añadirlo al catálogo de `shared` (`CHART_TYPES`) y escribir su render en `ReportChart.tsx`. El backend no cambia.

**¿Cómo sabes que aguanta con muchos tickets?**
Porque está medido: `npm run perf` carga 10 000 tickets y mide cada pantalla. Lo más lento es ordenar la bandeja por solicitante (0,84 s); el spec pide menos de 2 s. La primera medición falló (3,4 s en un filtro de horas laborales) y el arreglo fue una caché por día en el motor de SLA.

**¿Es accesible?**
axe revisa las pantallas principales en tema claro y oscuro en cada ejecución de las E2E (contraste AA, controles con nombre), el Kanban se maneja con teclado y la prioridad siempre lleva texto, no solo color.

**¿Qué mejorarías?**
El módulo de mantenimiento de activos (segunda fase), caché de IA compartida (Redis) si hay varios servidores, y probar con lector de pantalla real además de axe.

---

## 13. Ensayo en el equipo de la presentación

Hacerlo **en esa máquina** y con antelación: es lo único de la fase F8 que no se puede comprobar desde el equipo de desarrollo.

**La víspera**

- [ ] `git pull`, `npm install` y `npm test` en verde.
- [ ] MongoDB arranca solo con el equipo (`Get-Service MongoDB` → *Running*).
- [ ] `npm run test:e2e` en verde: si pasa, los cinco recorridos funcionan en esa máquina y sin IA.
- [ ] Probar la red del aula: ¿llega a `generativelanguage.googleapis.com`? Si no, se presenta sin IA (ver abajo).

**La mañana de la defensa**

- [ ] `npm run seed`: los plazos "en riesgo" y "vencidos" se calculan desde el momento de sembrar.
- [ ] `npm run dev` y abrir <http://localhost:5173>.
- [ ] Dos ventanas con sesión: el supervisor (`daury.guzman@…`) y el empleado (`diego.castillo@…`), para enseñar el tiempo real.
- [ ] Zoom del navegador a 125 % para el proyector y tema claro (proyecta mejor).

**El guion: los cinco recorridos**, en el mismo orden que las E2E (`e2e/01…05`)

1. Acceso: contraseña mal escrita, luego bien.
2. El empleado crea un ticket para IT; el supervisor lo toma, contesta, deja una nota interna y lo resuelve; el empleado ve la solución, **no ve la nota**, y califica.
3. Kanban: arrastrar a *En progreso*, recargar y sigue ahí. Arrastrar a *Abierto*: el servidor lo rechaza.
4. Con las dos ventanas a la vista, crear un ticket: sube el tablero del supervisor y suena su campana.
5. Reportes: el empleado solo ve "Yo"; la administradora ve las cuatro opciones.

**Plan B sin IA**

- Dejar `GEMINI_API_KEY` vacía en `.env` y reiniciar: las funciones de IA desaparecen de la pantalla y todo lo demás funciona igual (las E2E lo prueban en cada ejecución).
- O apagar solo «Sugerir área al crear un ticket» en *Administración → Configuración* si la cuota gratuita se agota en plena demo.
- Si falla Google, el inicio de sesión por correo no depende de nada externo.
