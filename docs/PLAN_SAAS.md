# Plan de desarrollo — Tekzaya SaaS

> **Objetivo:** convertir Tekzaya, que hoy sirve a **una sola organización**, en un producto que se vende por suscripción a **muchas empresas**. Cada empresa tiene sus datos aislados y su propio acceso. Todos los planes incluyen **Tickets y Mantenimiento juntos**, como funciona hoy.
> **Contexto:** proyecto académico. El cobro es **simulado**: no se conecta ninguna pasarela real ni se mueve dinero (§7).
> **Base:** `DOCUMENTACION_TECNICA.md`, `DESIGN.md`, `PRODUCT.md` y el código de `dev` (commit `dcf94d5`).
> **Fecha:** 20 de noviembre de 2026.

---

## 0. Resumen

| # | Fase | Qué entrega | Depende de | Duración estimada |
|---|---|---|---|---|
| F1 | **Multiempresa (tenants)** | Cada empresa ve solo sus datos. Base de todo lo demás | — | 3 semanas |
| F2 | **Planes y límites** | Catálogo de planes, límites por plan y cumplimiento en la API | F1 | 2 semanas |
| F3 | **Login por empresa y alta de clientes** | Subdominio, marca, métodos de acceso y asistente de registro | F1, F2 | 2 semanas |
| F4 | **Cobro simulado** | Pasarela ficticia, pruebas gratis, impagos y facturas de demostración | F2, F3 | 1,5 semanas |
| F5 | **Consola de plataforma** | Panel administrativo con clientes, suscripciones, uso y gráficas | F1, F2, F4 | 3 semanas |
| F6 | **Landing page** | Sitio público con precios y registro | F2 (precios) | 2 semanas, **en paralelo** desde F2 |

**Total:** unas 12 semanas para una persona y 7 a 8 semanas para dos, con la landing en paralelo.

**Regla del orden:** F1 va primero y no admite atajos. Si se construyen planes o la consola antes de aislar los datos, habrá que reescribirlos.

**Tickets y Mantenimiento no se separan.** Siguen siendo un solo producto, con el vínculo entre ticket, activo y orden de trabajo tal como está hoy. Ningún plan apaga un módulo. Lo que cambia entre planes son los **límites y las funciones avanzadas** (§5).

---

## 1. Punto de partida

Esto es lo que hoy en el código supone **una sola organización**. Cada punto tiene que cambiar en F1.

| Lugar | Hoy | Problema en multiempresa |
|---|---|---|
| `models/*.ts` | Ningún documento tiene `tenantId` | Una consulta devuelve datos de todas las empresas |
| `user.model.ts` | `email` es `unique` global | Dos empresas no pueden tener al mismo correo |
| `area.model.ts` | `name` es `unique` global | Solo una empresa podría tener un área llamada "IT" |
| `ticket`, `asset`, `workOrder`, `sparePart` | `number` es `unique` global | La empresa B empezaría en `TK-0347` en vez de `TK-0001` |
| `counter.model.ts` | `_id` = tipo (`ticket`, `asset`…) | Una sola secuencia compartida |
| `support.models.ts` → `Settings` | Documento único `_id: "app"` | SLA, horario y festivos serían iguales para todos |
| `realtime/realtime.ts` | Salas `user:`, `area:`, `ticket:` | Sin prefijo de empresa. Hoy no se cruzan porque los IDs son únicos, pero no hay una barrera explícita |
| `jobs/*.job.ts` | Recorren toda la colección | Deben respetar la configuración de cada empresa |
| `uploads/` | Una sola carpeta | No se puede medir el espacio por empresa ni borrar una empresa completa |
| `middleware/auth.ts` | El actor no lleva empresa | No hay forma de exigir que el recurso sea de la empresa del usuario |
| Rol `admin` | Administra **toda** la aplicación | Pasa a ser "administrador **de su empresa**". Hace falta un nivel nuevo por encima |

---

## 2. Decisiones de arquitectura

### 2.1 Modelo de aislamiento: base compartida con `tenantId`

| Opción | Ventajas | Desventajas | Veredicto |
|---|---|---|---|
| **Base compartida con campo `tenantId`** | Una sola base, migraciones simples, barato, encaja con Mongoose | Un olvido en una consulta filtra datos | **Elegida.** El riesgo se controla con un plugin obligatorio (§3.3) |
| Una base de datos por empresa | Aislamiento fuerte, borrar una empresa es borrar su base | Conexiones por empresa, índices y migraciones multiplicados, los jobs recorren N bases | Reservar para un plan Enterprise con exigencias legales |
| Un esquema o colección por empresa | — | MongoDB no lo hace mejor que las otras dos | Descartada |

El código queda preparado para mover una empresa grande a su propia base más adelante: todo el acceso pasa por el contexto de empresa (§3.2).

### 2.2 Cómo se identifica la empresa

- **Producción:** por subdominio. `acme.tekzaya.com` → empresa con `slug: "acme"`.
- **Desarrollo y pruebas:** cabecera `X-Tenant: acme` o variable `DEV_TENANT`, porque `localhost` no tiene subdominios. También sirve `acme.localhost:5173`, que los navegadores resuelven solos.
- **Dominio propio** (`soporte.acme.com`) en el plan Empresa: tabla `domains` que apunta a la empresa.

### 2.3 Tres aplicaciones, una API

```
tekzaya.com               → apps/landing   (sitio público, precios, registro)
{empresa}.tekzaya.com     → apps/web       (la app actual, por empresa)
console.tekzaya.com       → apps/console   (panel del dueño de la plataforma)
api.tekzaya.com           → apps/api       (una API; rutas /api/v1 y /platform/v1)
```

- La **consola** es una app aparte, no una página más dentro de `apps/web`. Tiene otro público, otra sesión y otros permisos, y un fallo en la app de clientes no debe abrir la consola.
- La API es una sola, pero las rutas de plataforma (`/platform/v1/*`) usan **otra cookie, otro secreto JWT y otra colección de usuarios** (`PlatformUser`).

### 2.4 Niveles de usuario

| Nivel | Dónde vive | Qué hace |
|---|---|---|
| **Operador de plataforma** (super admin) | `platform_users`, sin `tenantId` | Ve todas las empresas, cambia planes, suspende y da soporte |
| **Administrador de empresa** | `users` con `role: "admin"` | Lo que hoy hace el admin, solo dentro de su empresa, más la facturación |
| **Empleado / técnico** | `users` con `role: "employee"` | Igual que hoy |
| **Solicitante** | `users` con `role: "requester"` | Igual que hoy |

Un operador de plataforma **nunca** es un usuario de una empresa. Para ver lo que ve un cliente usa la *suplantación auditada* (§8.4).

---

## 3. F1 — Multiempresa en la base de datos

### 3.1 Modelo `Tenant`

```ts
// apps/api/src/models/tenant.model.ts
{
  _id: ObjectId,
  slug: string,              // único global, "acme"; se usa en el subdominio
  name: string,              // "Acme S.R.L."
  status: "trialing" | "active" | "past_due" | "suspended" | "canceled",
  planId: ObjectId,          // F2
  limitsOverride?: Partial<PlanLimits>,                 // excepciones pactadas a mano
  branding: { logoUrl?, primaryColor?, loginMessage? }, // F3
  auth: { password: boolean, google: boolean, allowedDomains: string[], ssoConfigId? },
  locale: "es", timezone: string,   // zona IANA de la empresa; el SLA y los jobs la usan
  trialEndsAt?: Date, createdAt, updatedAt, deletedAt?
}
```

### 3.2 Contexto de empresa en cada petición

1. **Middleware `resolveTenant`** (antes de `requireAuth`): lee el subdominio o la cabecera, busca el `Tenant` (con caché en memoria de 60 s), rechaza si está `suspended` o `canceled` y lo guarda en `res.locals.tenant`.
2. **`requireAuth`**: el JWT lleva `tid`. Si `user.tenantId !== tenant._id`, responde **401**. Un token de la empresa A no sirve en el subdominio de B.
3. **`AsyncLocalStorage`** (`apps/api/src/tenancy/context.ts`): guarda `{ tenantId }` durante toda la petición, para que los servicios no tengan que pasarlo de mano en mano.
4. El `Actor` de `@tekzaya/shared` gana `tenantId`.

### 3.3 Plugin de Mongoose obligatorio

`apps/api/src/tenancy/tenantPlugin.ts`, aplicado a **todos** los modelos excepto `Tenant`, `PlatformUser` y `Plan`:

- Añade `tenantId: { type: ObjectId, required: true, index: true }`.
- En `find*`, `count*`, `update*`, `delete*` y `aggregate`, inyecta `{ tenantId }` desde el contexto.
- **Si no hay contexto, lanza un error.** No hace una consulta sin filtro. Los jobs y los scripts tienen que abrir el contexto con `runAsTenant(tenantId, fn)`, o con `runAsPlatform(fn)` cuando necesitan cruzar empresas a propósito.
- En `save` y `insertMany`, rellena `tenantId` si falta y rechaza si no coincide con el contexto.
- Para `aggregate`, antepone `{ $match: { tenantId } }`. Los `$lookup` se revisan a mano (ver lista en §3.7).

> Esta es la pieza que hace segura la base compartida. Necesita más pruebas que cualquier otra cosa del plan.

### 3.4 Índices

Cada índice único global pasa a ser compuesto con `tenantId`, y los índices de consulta lo llevan como primer campo:

| Colección | Antes | Después |
|---|---|---|
| `users` | `{ email: 1 }` único | `{ tenantId: 1, email: 1 }` único |
| `areas` | `{ name: 1 }` único | `{ tenantId: 1, name: 1 }` único |
| `tickets`, `assets`, `workorders`, `spareparts` | `{ number: 1 }` único | `{ tenantId: 1, number: 1 }` único |
| `tickets` | `{ areaId: 1, status: 1 }` … | `{ tenantId: 1, areaId: 1, status: 1 }` … (todos) |
| `tickets` | texto `{ title, description }` | Igual, filtrando por `tenantId` en la misma consulta |
| `workorders` | único parcial por `planId` | Sin cambio: `planId` ya es de una sola empresa |

### 3.5 Contadores, configuración, archivos y tiempo real

- **Contadores:** `_id` pasa de `"ticket"` a `"<tenantId>:ticket"`. `nextNumber(kind)` toma la empresa del contexto. Cada empresa empieza en `TK-0001`.
- **Configuración:** `Settings._id` pasa a ser el `tenantId`. `getSettings()` lo lee del contexto y crea la configuración por defecto la primera vez.
- **Adjuntos:** ruta `uploads/<tenantId>/<archivo>`. La descarga comprueba la empresa además del permiso del ticket. Se guarda `size` para medir el espacio usado (§5).
- **Socket.IO:** el *handshake* resuelve la empresa igual que HTTP. Las salas pasan a `t:<tenantId>:user:<id>`, `t:<tenantId>:area:<id>` y `t:<tenantId>:ticket:<id>`.
- **Jobs:** cada job recorre las empresas `active` o `trialing` y ejecuta su lógica dentro de `runAsTenant`, usando el horario y los festivos de esa empresa. Si una empresa falla, se registra el error y el job sigue con las demás.

### 3.6 Migración de los datos actuales

Script `apps/api/src/migrations/001-tenancy.ts`, idempotente:

1. Crear el `Tenant` por defecto (`slug` configurable, por ejemplo `demo`).
2. `updateMany({ tenantId: { $exists: false } }, { $set: { tenantId } })` en cada colección.
3. Renombrar los contadores y el documento de `Settings`.
4. Mover `uploads/*` a `uploads/<tenantId>/`.
5. Eliminar los índices únicos viejos y crear los compuestos (`syncIndexes`).
6. Verificar: ningún documento sin `tenantId`.

Adaptar también `seed.ts`, `seed-maintenance.ts` y `refresh-dates.ts` para que siembren **dos** empresas. Así el aislamiento se ve a simple vista en desarrollo.

### 3.7 Lista de revisión manual

- Toda llamada a `aggregate` con `$lookup` (sobre todo en `reports/` y `stats/`).
- Búsquedas por `_id` (`findById`): el plugin añade `tenantId`, pero hay que confirmar que nadie use `collection.findOne` del driver directo.
- Vínculos entre tickets, activos y órdenes de trabajo: al vincular, comprobar que el activo o la orden sean de la misma empresa.
- `accessLinks.service.ts`: los enlaces de acceso llevan la empresa.
- Inicio de sesión con Google: verificar el token **y** que el correo pertenezca a un usuario de esa empresa.
- Funciones de IA: el contexto que se envía a Gemini (tickets parecidos, artículos) solo puede venir de la misma empresa.

### 3.8 Definición de listo

- [ ] Prueba de aislamiento por cada ruta de la API: un usuario de la empresa A recibe **404** (no 403, para no revelar que existe) al pedir un recurso de B.
- [ ] Prueba del plugin: consulta sin contexto → error.
- [ ] Prueba de Socket.IO: un evento de A no llega a un cliente de B.
- [ ] Los jobs respetan el horario de cada empresa (dos empresas con zonas horarias distintas).
- [ ] Migración probada sobre una copia de la base de desarrollo, ejecutando las pruebas desde `apps/api`.
- [ ] La suite actual (Vitest y Playwright) sigue en verde.

---

## 4. F2 — Planes de suscripción

### 4.1 Principios

1. **Un solo producto.** Todos los planes incluyen **Tickets y Mantenimiento**, con el vínculo entre ticket, activo y orden de trabajo. Así funciona hoy y es lo que diferencia a Tekzaya.
2. **Cobrar por técnico, no por persona.** Lo que da valor es quien atiende tickets u órdenes. Los **solicitantes son ilimitados** en todos los planes. Es un argumento de venta fuerte y ya existe el rol `requester`.
3. **Tres niveles**, no cinco. Cada nivel resuelve un tamaño de empresa distinto: se diferencian por límites y funciones avanzadas.
4. **Prueba gratis de 14 días** del plan Profesional, sin tarjeta.

### 4.2 Propuesta de planes

> Precios de referencia en USD, por técnico al mes, con facturación mensual. La anual lleva **2 meses gratis** (unos 17 % de descuento). Como el cobro es simulado (§7), estos números sirven para la demostración y para calcular las métricas de la consola.

| | **Básico** | **Profesional** | **Empresa** |
|---|---|---|---|
| Para quién | Equipos pequeños que empiezan a ordenar sus solicitudes y equipos | Empresas medianas con varias áreas | Organizaciones grandes o con requisitos de seguridad |
| **Precio por técnico / mes** | **$15** | **$30** | **$55** |
| Precio anual por técnico | $150 | $300 | $550 |
| Incluye | Tickets + Mantenimiento | Tickets + Mantenimiento | Tickets + Mantenimiento |
| Mínimo de técnicos | 1 | 3 | 10 |
| Máximo de técnicos | 5 | 50 | Sin límite |
| Solicitantes | Ilimitados | Ilimitados | Ilimitados |
| Áreas | 2 | Ilimitadas | Ilimitadas |
| Activos | 100 | 2.000 | Ilimitados |
| Almacenamiento de adjuntos | 5 GB | 50 GB por empresa + 2 GB por técnico | 1 TB |
| SLA | Plazos fijos por defecto | Plazos, horario y festivos configurables | Igual, más políticas por área |
| Asignación automática | — | ✓ | ✓ |
| Kanban, fusión de duplicados, CSAT | ✓ | ✓ | ✓ |
| Convertir ticket en orden de trabajo | ✓ | ✓ | ✓ |
| Preventivos | 10 planes | Ilimitados | Ilimitados |
| Inventario de repuestos | — | ✓ | ✓ |
| Reportes | Plantillas | Plantillas y reportes propios | Igual, más exportaciones programadas |
| IA (Gemini) | — | 500 acciones al mes | 5.000 acciones al mes |
| Inicio con Google | ✓ | ✓ | ✓ |
| Restringir por dominio de correo | — | ✓ | ✓ |
| SSO (SAML / OIDC) | — | — | ✓ |
| Marca propia (logo y color) | — | ✓ | ✓ |
| Dominio propio | — | — | ✓ |
| Historial de auditoría | 30 días | 1 año | Sin límite |
| Soporte | Correo, 48 h | Correo y chat, 24 h | Gerente de cuenta, 4 h |

**Por qué estos números:**

- **Básico** deja usar todo el flujo (tickets, activos, órdenes, preventivos) con límites bajos, para que una empresa pequeña vea el producto completo.
- **Profesional** suma lo que necesita una empresa con varias áreas: SLA configurable, asignación automática, repuestos, reportes propios e IA. Es el plan "Más elegido".
- **Empresa** suma seguridad e identidad: SSO, dominio propio y auditoría sin límite.
- El **mínimo de 3 técnicos** en Profesional fija un ingreso mínimo de $90 al mes por cliente.
- La **IA** tiene cupo porque cuesta dinero por cada uso. Se venden paquetes extra (por ejemplo, 1.000 acciones por $10).

**Cuenta de ejemplo:** una empresa con 8 técnicos en Profesional anual paga 8 × $300 = **$2.400 al año**.

### 4.3 Modelo de datos

```ts
// Plan: catálogo que edita el operador desde la consola (F5)
{
  _id, code: "pro", name: "Profesional", isPublic: true, isActive: true,
  prices: [
    { interval: "month", amount: 3000, currency: "USD" },   // centavos por técnico
    { interval: "year",  amount: 30000, currency: "USD" }
  ],
  limits: {
    minAgents: 3, maxAgents: 50, maxAreas: null, maxAssets: 2000,
    storageGb: 50, storageGbPerAgent: 2, aiActionsPerMonth: 500, maxPreventivePlans: null,
    auditRetentionDays: 365
  },
  features: { autoAssign: true, customSla: true, customReports: true, spareParts: true,
              branding: true, domainRestriction: true, sso: false, customDomain: false }
}

// Subscription: una activa por empresa
{
  _id, tenantId, planId, interval: "month",
  seats: 8,                       // técnicos contratados
  status: "trialing" | "active" | "past_due" | "canceled" | "incomplete",
  currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, trialEndsAt,
  paymentMethod?: { brand: "visa", last4: "4242", testCard: "success" }  // §7: tarjeta de prueba
}

// SubscriptionEvent: historial (altas, cambios, bajas, pagos); alimenta las métricas de F5
{ tenantId, type: "created"|"upgraded"|"downgraded"|"renewed"|"payment_failed"|"canceled"|...,
  mrrBefore, mrrAfter, at, meta }

// UsageCounter: consumo del mes
{ tenantId, period: "2026-11", aiActions: 132, storageBytes: ..., }
```

### 4.4 Cumplimiento de límites

- **`entitlements(tenant)`** en `shared`: une el plan y los `limitsOverride` en un solo objeto. La API y la web usan la misma función. `GET /me` lo devuelve para que la web no decida por su cuenta.
- **`requireFeature("customReports")`** y **`assertWithinLimit("agents")`** en las rutas que crean cosas (usuario técnico, área, activo, plan preventivo, repuesto, adjunto, llamada a IA).
- **Técnico = usuario con rol `employee` y estado activo.** Desactivar a uno libera su lugar. Los solicitantes no cuentan.
- **Al llegar al límite:** no se borra ni se bloquea lo que ya existe. Solo se impide crear más, con un mensaje claro y un botón para mejorar el plan.
- **Funciones fuera del plan** (por ejemplo, repuestos en Básico): la entrada del menú se ve con un candado y lleva a una pantalla que explica qué plan la incluye.
- **Al bajar de plan:** si la empresa usa más de lo que permite el plan nuevo, se avisa antes de confirmar y se le dan 14 días para ajustarse.
- **Avisos** al 80 % y al 100 % de cada límite, dentro de la app y por correo al administrador.

### 4.5 Definición de listo

- [ ] Plan, precios y límites se siembran desde un archivo (`seed/plans.ts`) y la consola los puede editar.
- [ ] Pruebas por límite: crear el técnico n.º 6 en Básico → 402 `limit_reached`.
- [ ] Pruebas por función: `GET /spare-parts` en Básico → 403 `feature_not_in_plan`.
- [ ] Pantalla **Administración → Plan y facturación** en `apps/web`: plan actual, uso frente a límites (barras) y botón para cambiar de plan.

---

## 5. F3 — Login por empresa y alta de clientes

### 5.1 Login de cada empresa

`acme.tekzaya.com/login` muestra:

- El **logo, el nombre y el color** de Acme (plan Profesional o superior) y un mensaje opcional ("Usa tu correo @acme.com").
- **Solo los métodos que Acme activó:** contraseña, Google y, en el plan Empresa, SSO.
- Si `allowedDomains` tiene valores, el login con Google y el registro por invitación rechazan otros dominios.

`app.tekzaya.com/login` (sin subdominio) pide el **correo**, busca a qué empresas pertenece y redirige. Si hay varias, deja elegir. La respuesta tarda lo mismo exista o no el correo, para no revelar qué correos están registrados.

### 5.2 Configuración del acceso (Administración → Acceso)

| Opción | Plan |
|---|---|
| Activar o desactivar contraseña y Google | Todos |
| Política de contraseña (largo mínimo, caducidad) | Profesional+ |
| Dominios permitidos | Profesional+ |
| Alta automática: quien entra con Google y un dominio permitido se crea como solicitante | Profesional+ |
| Logo, color principal y mensaje del login | Profesional+ |
| SSO SAML 2.0 / OIDC (Azure AD, Google Workspace, Okta) | Empresa |
| Obligar la verificación en dos pasos a los administradores | Empresa |

### 5.3 Sesión

- La cookie se emite para el host exacto (`acme.tekzaya.com`), **no** para `.tekzaya.com`. Así una sesión de Acme nunca viaja a otra empresa.
- El JWT lleva `sub`, `tid` y `ver` (versión de sesión). Cambiar la contraseña o suspender la empresa invalida todas las sesiones.
- El límite de intentos de login (`express-rate-limit`) se cuenta por empresa y por correo.

### 5.4 Registro de una empresa nueva (desde la landing)

1. **Formulario:** nombre de la empresa, subdominio deseado (validado en vivo), nombre, correo y contraseña del administrador, o Google.
2. **Verificación del correo** con un enlace de un solo uso.
3. **Asistente de 3 pasos** dentro de la app:
   1. Crear las áreas (con sugerencias: IT, Mantenimiento, RRHH).
   2. Invitar a los técnicos por correo.
   3. Datos de ejemplo opcionales para explorar (tickets, activos y preventivos), con un botón para borrarlos.
4. La empresa queda en `trialing` durante 14 días con el plan Profesional.

**Subdominios reservados:** `www`, `app`, `api`, `console`, `admin`, `status`, `docs`, `mail`, `help` y palabras ofensivas.

### 5.5 Definición de listo

- [ ] Prueba E2E: registro → verificación → asistente → crear el primer ticket.
- [ ] Prueba: la cookie de Acme no sirve en `beta.tekzaya.com`.
- [ ] Prueba: con `allowedDomains: ["acme.com"]`, Google con `@gmail.com` → rechazado.

---

## 6. Correo transaccional

Hace falta para la verificación, las invitaciones, la recuperación de contraseña, los avisos de límite, el fin de la prueba, el pago fallido y la baja. Plantillas en español con la marca de la empresa cuando corresponda.

Como es un proyecto académico, en desarrollo y en la demostración los correos se capturan en **Mailpit** (o Ethereal) en vez de enviarse de verdad. Se ven en una bandeja web local. Cambiar a un proveedor real (Resend, Postmark) solo exige otra variable de entorno.

---

## 7. F4 — Cobro simulado

### 7.1 Decisión

Tekzaya es un proyecto académico: **no se conecta ninguna pasarela real** (Stripe, PayPal ni locales) y **no se mueve dinero**. En su lugar se construye una **pasarela ficticia** que se comporta como una real: aprueba, rechaza, renueva y falla según la tarjeta de prueba. Así se pueden demostrar todos los flujos de una suscripción (prueba, pago, renovación, impago, suspensión y baja) sin cuentas externas ni claves.

### 7.2 Diseño

- Interfaz `BillingGateway` en `apps/api/src/modules/billing/gateway.ts` con `createCheckout`, `charge`, `updateSeats`, `cancel` y `refund`.
- Una sola implementación: **`SimulatedGateway`**. La interfaz existe para que el resto del código no dependa de la simulación y quede claro dónde iría una pasarela real.
- Variable `BILLING_MODE=simulated` (la única admitida).
- Toda la app muestra en la pantalla de facturación una franja fija: **"Modo demostración: no se realizan cobros reales"**.

### 7.3 Tarjetas de prueba

El formulario de pago **solo acepta estos números**. Cualquier otro se rechaza con "Usa una tarjeta de prueba", para que nadie escriba datos reales. No se guarda el número completo ni el CVC: solo la marca, los últimos 4 dígitos y el comportamiento.

| Número | Resultado |
|---|---|
| `4242 4242 4242 4242` | Pago aprobado y renovaciones aprobadas |
| `4000 0000 0000 0002` | Pago rechazado ("Tarjeta rechazada") |
| `4000 0000 0000 9995` | Pago rechazado ("Fondos insuficientes") |
| `4000 0000 0000 0341` | El primer pago se aprueba y **la renovación falla** (para demostrar el impago) |
| `5555 5555 5555 4444` | Mastercard aprobada |

Cualquier fecha futura y cualquier CVC de 3 dígitos sirven. La página de pago lista estas tarjetas con un botón "Usar" al lado de cada una.

### 7.4 Flujo

1. Al terminar la prueba, o antes si el cliente lo decide: **Administración → Plan y facturación → Elegir plan**, con plan, intervalo y número de técnicos. El precio total se calcula en vivo.
2. **Página de pago simulada** en `apps/web` (`/facturacion/pagar`): formulario de tarjeta con las tarjetas de prueba. Espera de 1 a 2 segundos con "Procesando pago…" para que se sienta real.
3. **La API** llama a `SimulatedGateway.charge()`, que decide el resultado según la tarjeta y luego hace lo mismo que haría un webhook real:
   - Aprobado → crea la `Subscription`, pone la empresa en `active`, genera la factura y registra el evento.
   - Rechazado → no cambia nada y muestra el motivo.
4. **Cambiar el número de técnicos o de plan** calcula el prorrateo de los días que faltan y genera una factura por la diferencia.
5. **Renovación:** el job diario `billing.job.ts` cobra a las suscripciones cuyo período terminó, con el comportamiento de la tarjeta guardada.
6. **Cancelar:** la suscripción sigue activa hasta el final del período y luego pasa a `canceled`.

### 7.5 Facturas de demostración

- Modelo `Invoice`: número `FAC-0001` (secuencia por empresa), conceptos, subtotal, total, estado (`paid`, `failed`, `refunded`) y fecha.
- Se ven en **Plan y facturación → Facturas** y se descargan en PDF con la leyenda **"Documento de demostración sin validez fiscal"**.

### 7.6 Estados y período de gracia

| Estado | La empresa puede… |
|---|---|
| `trialing` | Todo lo del plan de prueba |
| `active` | Todo lo de su plan |
| `past_due` (días 1 a 7) | Todo, con un aviso fijo arriba para el administrador |
| `past_due` (días 8 a 14) | **Solo lectura**: ver y exportar, sin crear |
| `suspended` (día 15+) | Solo el administrador entra, a la pantalla de pago |
| `canceled` | Datos guardados 90 días, luego se borran (con aviso a los 60 y a los 85) |

`billing.job.ts` mueve las empresas entre estados y manda los correos.

### 7.7 Controles para la demostración (en la consola, F5)

Para enseñar todo el ciclo en una presentación sin esperar días:

- **Adelantar el reloj de facturación** de una empresa N días (`billingClockOffsetDays`). Solo afecta a la facturación, no al SLA.
- **Simular un pago fallido** en la próxima renovación.
- **Marcar una factura como pagada** (como si el cliente pagara por transferencia).
- **Terminar la prueba ahora.**
- **Generar historial:** crea 12 meses de eventos de suscripción para varias empresas, para que las gráficas de la consola tengan datos.

### 7.8 Definición de listo

- [ ] Pruebas de cada tarjeta: aprobada, rechazada, fondos insuficientes y renovación fallida.
- [ ] Prueba: un número que no está en la lista → rechazado sin llegar a la pasarela.
- [ ] Prueba E2E: prueba → pago → renovación fallida → `past_due` → solo lectura → pago → `active`, usando el adelanto del reloj.
- [ ] La franja "Modo demostración" aparece en todas las pantallas de facturación.

---

## 8. F5 — Consola de plataforma

### 8.1 Acceso

- App `apps/console` (React + Vite + Tailwind + Recharts, igual que `apps/web`, reutilizando `DESIGN.md`).
- Colección `platform_users`: correo, contraseña, **verificación en dos pasos obligatoria (TOTP)** y rol `owner` | `support` | `finance`.
- Sin registro público. El primer `owner` se crea con un script de la línea de comandos.
- Cookie y secreto JWT propios. Sesión de 8 horas.
- **Toda acción que cambie algo queda en `platform_audit_log`** con quién, qué, cuándo y en qué empresa.

| Permiso | owner | support | finance |
|---|---|---|---|
| Ver clientes y uso | ✓ | ✓ | ✓ |
| Suplantar a un usuario | ✓ | ✓ | — |
| Extender prueba, cambiar límites | ✓ | ✓ | — |
| Cambiar plan, reembolsos, marcar pagos | ✓ | — | ✓ |
| Controles de demostración (§7.7) | ✓ | — | ✓ |
| Editar el catálogo de planes | ✓ | — | — |
| Suspender o borrar empresas | ✓ | — | — |
| Gestionar operadores | ✓ | — | — |

### 8.2 Pantallas

**1. Resumen.** Fila de indicadores y gráficas:

| Indicador | Cálculo |
|---|---|
| **MRR** (ingreso mensual recurrente) | Suma de suscripciones `active` normalizadas a un mes, con la variación frente al mes anterior |
| **ARR** | MRR × 12 |
| **Clientes de pago** | Empresas `active` |
| **En prueba** | Empresas `trialing`, cuántas terminan esta semana |
| **Conversión de prueba a pago** | Pruebas que pasaron a `active` / pruebas terminadas en los últimos 90 días |
| **Abandono (churn)** | Clientes que cancelaron en el mes / clientes al inicio del mes |
| **ARPA** | MRR / clientes de pago |
| **Técnicos y solicitantes** | Totales de la plataforma |
| **Usuarios activos (30 días)** | Usuarios con al menos una sesión en 30 días |

| Gráfica | Tipo | Para qué |
|---|---|---|
| Evolución del MRR (12 meses) | Área apilada: nuevo, expansión, contracción y abandono | Ver si el negocio crece y por qué |
| Altas y bajas por mes | Barras agrupadas | Comparar la entrada y la salida de clientes |
| Clientes por plan | Barras horizontales | Saber qué plan se vende más |
| Embudo de prueba | Barras de embudo: registro → asistente completado → primer ticket u OT → pago | Encontrar dónde se pierden los clientes |
| Usuarios activos (diarios y mensuales) | Líneas | Uso real de la plataforma |
| Volumen de tickets y OT creados | Líneas por semana | Actividad total, y cuánto se usa cada parte del producto |
| Clientes cerca del límite | Tabla con barra de uso | Oportunidades de mejora de plan |
| Pagos fallidos | Tabla | Cobros que hay que seguir |

**2. Clientes.** Tabla con búsqueda, filtros (plan, estado, país, fecha de alta) y exportación CSV.
Columnas: empresa, subdominio, plan, estado, técnicos usados / contratados, solicitantes, activos, MRR, fecha de alta, último acceso y salud.

**Salud del cliente** (verde, ámbar o rojo): combina el uso en los últimos 14 días, la tendencia de usuarios activos, los pagos fallidos y los límites al 100 %. Sirve para anticipar bajas.

**3. Detalle de un cliente.**
- Ficha: datos, administradores y contacto.
- Suscripción: plan, técnicos, intervalo, próxima renovación e historial de eventos.
- Uso frente a límites: barras por técnicos, activos, almacenamiento e IA del mes.
- Actividad: gráfica de tickets y OT por semana, usuarios activos y último acceso.
- Facturas y pagos simulados.
- Acciones: cambiar plan, ajustar límites (`limitsOverride`), extender la prueba, suspender o reactivar, **suplantar**, exportar todos sus datos y los controles de demostración (§7.7).
- Notas internas del equipo.

**4. Suscripciones.** Lista de todas, con filtros por estado y por renovación próxima.

**5. Planes.** Editor del catálogo: precios, límites y funciones. Un cambio de precio **no** afecta a los clientes actuales (*grandfathering*) salvo que se migren a mano.

**6. Facturación.** Facturas, pagos simulados, reembolsos y pagos marcados a mano.

**7. Auditoría.** Registro de acciones de los operadores, con filtros.

**8. Sistema.** Estado de los jobs (última ejecución, errores por empresa), uso de IA total y espacio total en disco.

### 8.3 De dónde salen los datos

- **No calcular las métricas en vivo** sobre todas las colecciones de todas las empresas.
- Job nocturno `platformSnapshot.job.ts` que guarda en `tenant_usage_daily` una fila por empresa y día: técnicos, solicitantes, usuarios activos, tickets creados, OT creadas, activos, bytes de adjuntos y acciones de IA.
- El MRR y el abandono se calculan a partir de `subscription_events`, que es un historial que solo crece.
- Las rutas `/platform/v1/*` corren en `runAsPlatform`: es el único lugar donde está permitido cruzar empresas.

### 8.4 Suplantación (ver la app como un cliente)

- El operador elige a un usuario, escribe un motivo obligatorio y recibe una sesión de **30 minutos** en el subdominio de esa empresa.
- La app muestra una franja fija: "Estás viendo Tekzaya como Ana Pérez (Acme) · Salir".
- Queda registrada en la auditoría de la plataforma **y** en la de la empresa.
- Por defecto, solo lectura. El modo con escritura requiere el rol `owner`.

### 8.5 Definición de listo

- [ ] Login con dos pasos obligatorios y pruebas de que un token de empresa no sirve en `/platform`.
- [ ] Indicadores del resumen comprobados contra una semilla con eventos conocidos (por ejemplo, MRR esperado = $1.230).
- [ ] La suplantación queda auditada en los dos registros.

---

## 9. F6 — Landing page

### 9.1 Tecnología

**Astro** en `apps/landing`: genera HTML estático, carga muy rápido, tiene buen SEO y permite incrustar componentes React si hacen falta. Los precios se leen de `packages/shared/plans.ts`, la misma fuente que usa la API, o de `GET /public/v1/plans` al compilar. Así nunca hay dos tablas de precios distintas.

### 9.2 Estructura de la página

| # | Sección | Contenido | Consejo |
|---|---|---|---|
| 1 | **Hero** | Titular, una línea de apoyo, botón "Prueba 14 días gratis" y otro "Ver demo". Captura real de la app (Kanban o tablero) | El titular dice el resultado, no la función. Ej.: *"Cada solicitud atendida a tiempo. Cada equipo funcionando."* |
| 2 | **Franja de confianza** | Logos de clientes o cifras ("+X tickets resueltos") | Si aún no hay clientes, omitirla. No inventar logos |
| 3 | **El problema** | 3 dolores concretos: solicitudes por WhatsApp y correo que se pierden, equipos que fallan sin aviso, no saber quién está atendiendo qué | Escrito con las palabras del cliente |
| 4 | **Todo en una plataforma** | Dos bloques: **Tickets** y **Mantenimiento**, cada uno con 3 o 4 beneficios y una captura. Debajo, cómo se unen: un ticket se vincula a un equipo y se convierte en orden de trabajo | Deja claro que es un solo producto, no dos |
| 5 | **Cómo funciona** | 3 pasos: el empleado reporta → el área atiende con SLA → el panel mide | Diagrama simple o animación corta |
| 6 | **Funciones destacadas** | SLA en horario laboral, IA que prioriza y sugiere, Kanban, preventivos automáticos, reportes con 11 tipos de gráfica, solicitantes ilimitados | Cuadrícula con iconos, sin párrafos largos |
| 7 | **Precios** | Selector mensual / anual y las 3 columnas, con "Más elegido" en Profesional. Todos los planes dicen "Incluye Tickets y Mantenimiento" | Calculadora: "¿Cuántos técnicos?" → precio total |
| 8 | **Preguntas frecuentes** | ¿Qué es un técnico? ¿Los solicitantes pagan? ¿Puedo cambiar de plan? ¿Dónde se guardan mis datos? ¿Qué pasa al terminar la prueba? | Responde las objeciones antes de que frenen la compra |
| 9 | **Llamada final** | Repetir el botón de prueba con una frase corta | — |
| 10 | **Pie** | Producto, precios, contacto, términos, privacidad, iniciar sesión. Nota: "Proyecto académico" | — |

### 9.3 Diseño

- **Reutilizar la identidad de `DESIGN.md`:** el morado `accent` `#58479d`, los tonos `panel` oscuros y la tipografía de la app. Quien pase de la landing a la app debe sentir que es el mismo producto.
- **Capturas reales** de la app con datos de ejemplo creíbles, no ilustraciones genéricas. Es lo que más convence en software B2B.
- **Una sola acción principal** por pantalla: "Prueba gratis". "Ver demo" queda como secundaria.
- **Móvil primero:** la tabla de precios pasa a tarjetas apiladas en pantallas de 360 px.
- **Tema claro por defecto** en la landing (se lee mejor el texto de venta), con las capturas de la app en tema oscuro para que destaquen.
- Movimiento discreto: aparición suave al hacer scroll, sin animaciones que retrasen la lectura. Respetar `prefers-reduced-motion`.
- Para bocetarla antes de programar: hacer el *wireframe* en Figma con estas 10 secciones y luego el diseño final con los tokens de `DESIGN.md`.

### 9.4 Lo que no se ve pero hace falta

- **SEO:** título y descripción por página, Open Graph con imagen, `sitemap.xml` y datos estructurados `SoftwareApplication`.
- **Rendimiento:** Lighthouse ≥ 95, imágenes en AVIF/WebP con `width` y `height`.
- **Analítica** respetuosa (Plausible o similar) con eventos: clic en "Prueba gratis", vista de precios y registro completado.
- **Páginas legales:** términos de servicio y política de privacidad, aclarando que es un proyecto académico y que no se procesan pagos reales.
- **Accesibilidad:** contraste AA y navegación con teclado. Ya se prueba con axe en la app; añadir la landing a Playwright.

---

## 10. Seguridad y operación

- **Copias de seguridad** diarias de MongoDB con retención de 30 días, y una restauración de prueba al mes.
- **Exportar todos los datos de una empresa** (JSON + adjuntos en ZIP), para el cliente y para cumplir con las leyes de protección de datos.
- **Borrado completo de una empresa:** job que borra por `tenantId` en todas las colecciones y la carpeta `uploads/<tenantId>`.
- **Límites de uso por empresa** en la API, para que un cliente no degrade el servicio de los demás.
- **Registros (logs)** con `tenantId` en cada línea.
- **Monitoreo de errores** (Sentry o similar) con la etiqueta de la empresa.
- **Variables nuevas** en `.env.example`: `ROOT_DOMAIN`, `PLATFORM_JWT_SECRET`, `BILLING_MODE=simulated`, `SMTP_URL` (Mailpit en desarrollo), `DEV_TENANT`.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Una consulta sin filtro de empresa muestra datos de otra | **Crítico** | Plugin que falla sin contexto, pruebas de aislamiento por ruta y revisión manual de los `aggregate` |
| La migración rompe los índices o los números | Alto | Script idempotente, probado sobre una copia y con verificación al final |
| Los jobs tardan demasiado con muchas empresas | Medio | Procesar por lotes y, si crece, pasar a una cola (BullMQ) |
| Alguien escribe una tarjeta real en el pago simulado | Medio | Solo se aceptan los números de prueba, no se guarda el número completo y la página lo avisa |
| La consola expone demasiado poder | Alto | Dos pasos obligatorios, roles, auditoría y suplantación de solo lectura por defecto |
| El costo de la IA crece sin control | Medio | Cupo por plan, contador mensual y corte suave al llegar al límite |

---

## 12. Decisiones pendientes

1. **Plan gratis permanente:** ¿existe un plan gratuito (por ejemplo, 2 técnicos y 20 activos) además de la prueba? La recomendación es **no tenerlo**: la prueba de 14 días basta para la demostración.
2. **Un correo en varias empresas:** el diseño lo permite (índice único por empresa). Falta confirmar si se quiere mostrar el selector de empresas.
3. **Dirección de la app:** `{empresa}.tekzaya.com` o `app.tekzaya.com/{empresa}`. Se recomienda el subdominio; en la demostración local funciona con `acme.localhost`.

---

## 13. Lista de entregables por fase

**F1:** `Tenant`, `tenancy/context.ts`, `tenancy/tenantPlugin.ts`, `resolveTenant`, índices compuestos, contadores y configuración por empresa, adjuntos por carpeta, salas con prefijo, jobs por empresa, migración `001-tenancy.ts`, semilla de dos empresas y pruebas de aislamiento.

**F2:** `Plan`, `Subscription`, `SubscriptionEvent`, `UsageCounter`, `entitlements()`, `requireFeature` y `assertWithinLimit`, pantalla "Plan y facturación", candados en funciones fuera del plan y avisos de límite.

**F3:** login con marca por empresa, Administración → Acceso, login por correo en `app.`, registro, verificación de correo, asistente de 3 pasos, subdominios reservados y correo con Mailpit.

**F4:** `BillingGateway` + `SimulatedGateway`, tarjetas de prueba, página de pago simulada, `Invoice` con PDF de demostración, prorrateo, `billing.job.ts`, estados con período de gracia y controles de demostración.

**F5:** `apps/console`, `PlatformUser` con dos pasos, rutas `/platform/v1`, `platformSnapshot.job.ts`, las 8 pantallas, suplantación auditada y `platform_audit_log`.

**F6:** `apps/landing` en Astro, 10 secciones, precios desde la fuente compartida, páginas legales, SEO, analítica y pruebas de Playwright con axe.
