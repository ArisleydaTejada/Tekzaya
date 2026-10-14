# Tekzaya

Soporte interno por tickets con IA: un empleado reporta un problema, el área que corresponde lo atiende, el sistema mide los plazos (SLA) en horario laboral, avisa en tiempo real y genera reportes por rol.

> Los usuarios, tickets y métricas que trae la aplicación son **datos semilla de demostración**, no datos reales.

---

## Instalación en local (≈ 10 minutos)

### 1. Requisitos

| Herramienta | Versión | Comprobar |
|---|---|---|
| Node.js | 20 o superior (probado con 24) | `node -v` |
| npm | 10 o superior | `npm -v` |
| MongoDB Community | 7 o superior, como servicio local | Windows: `Get-Service MongoDB` |

¿Sin MongoDB instalado? Sirve también una base gratuita de **MongoDB Atlas**: se pega su cadena de conexión en `MONGODB_URI` (paso 3). En ese caso la aplicación necesita internet.

### 2. Descargar e instalar dependencias

```bash
git clone <url-del-repositorio> tekzaya
cd tekzaya
npm install
```

### 3. Configuración

```bash
cp .env.example .env              # Git Bash / macOS / Linux
Copy-Item .env.example .env       # PowerShell
```

Para probar en local **no hace falta tocar nada**: sin claves, la aplicación arranca con secretos de desarrollo y sin IA. Cada variable está explicada dentro de [`.env.example`](.env.example).

### 4. Datos de demostración

```bash
npm run seed
```

Crea 6 áreas, 15 personas y unos 100 tickets repartidos en los últimos 90 días: todos los estados del ciclo de vida, plazos en tiempo, en riesgo y vencidos, encuestas respondidas, un incidente detectado y una fusión de duplicados. **Borra lo que hubiera en la base** y se puede repetir: el generador tiene semilla fija y las fechas se calculan desde el momento de sembrar, para que los plazos "en riesgo" lo estén de verdad ese día.

### 5. Arrancar

```bash
npm run dev
```

Levanta la API en `http://localhost:4000` y la web en **http://localhost:5173**. Abre esa dirección e inicia sesión.

Si algo no carga, <http://localhost:5173/api/v1/health> dice si la API está viva y si llega a la base (`"db": "connected"`).

### Cuentas

Todas usan la contraseña **`Tekzaya2026!`**

| Rol | Correo | Qué ve |
|---|---|---|
| Administradora | `arisleyda.tejada@tekzaya.com` | Todo; configura usuarios, áreas, plazos e IA |
| Supervisor de área (IT) | `daury.guzman@tekzaya.com` | Los tickets y estadísticas de su área; asigna |
| Supervisora de RRHH | `elena.paredes@tekzaya.com` | Lectura de todas las áreas, usuarios y configuración |
| Empleado (Ventas) | `diego.castillo@tekzaya.com` | Sus solicitudes; atiende lo de su área |

Hay más cuentas de ejemplo en [`apps/api/src/seed/catalog.ts`](apps/api/src/seed/catalog.ts).

---

## Funciones opcionales

### Inteligencia artificial (Gemini)

Sin clave, la aplicación funciona entera: el ticket se crea con el área elegida a mano y prioridad *Media*, y las funciones de IA no aparecen en pantalla. Para activarla:

1. Crea una clave gratuita en <https://aistudio.google.com/apikey>.
2. Ponla en `GEMINI_API_KEY` del `.env` y reinicia `npm run dev`.

El plan gratuito admite pocas peticiones por minuto. Cada función se puede apagar por separado en *Administración → Configuración*.

### Inicio de sesión con Google

Necesita un `GOOGLE_CLIENT_ID` de Google Cloud Console. Sin él, el botón responde con un aviso claro y el inicio de sesión por correo sigue funcionando.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | API y web a la vez, con recarga en caliente |
| `npm run seed` | Rehace los datos de demostración |
| `npm test` | Pruebas unitarias y de integración (Vitest + Supertest, contra MongoDB) |
| `npm run test:e2e` | Los recorridos de la defensa y la auditoría de accesibilidad en Chromium (Playwright) |
| `npm run perf` | Siembra 10 000 tickets en una base aparte y mide contra los umbrales del spec §13 |
| `npm run typecheck` | Comprobación de tipos de los tres paquetes |
| `npm run lint` | oxlint |

Las pruebas de integración usan la base `tekzaya_test`, las E2E `tekzaya_e2e` y la medición `tekzaya_perf`: ninguna toca los datos de la demo.

**Primera vez con las E2E:** si Playwright no encuentra el navegador, instálalo con `npx playwright install chromium`. Las E2E arrancan su propia API (puerto 4100) y su propia web (5174), así que se pueden correr con `npm run dev` abierto.

---

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| `/api/v1/health` responde `db: disconnected` | MongoDB no está corriendo. En Windows: `Get-Service MongoDB` y `Start-Service MongoDB`. |
| `npm run seed` se queda esperando | Igual que arriba, o `MONGODB_URI` apunta a un servidor inalcanzable. |
| *Demasiados intentos desde este equipo* | Límite de 20 inicios de sesión por IP cada 15 min. Espera o reinicia la API. |
| Puerto 4000 o 5173 ocupado | Cambia `PORT` en `.env`; Vite elige otro puerto solo y lo indica en la consola. |
| *Secretos JWT de desarrollo* en la consola | Es un aviso, no un error. Para producción define `JWT_SECRET` y `JWT_REFRESH_SECRET`. |

---

## Estructura

```
apps/
  api/        Express 5 + Mongoose + Socket.IO + node-cron
  web/        React 19 + Vite + Tailwind 4 + TanStack Query + Recharts
packages/
  shared/     Contrato Zod, motor de permisos y motor de SLA (lo usan los dos lados)
e2e/          Recorridos de la defensa y accesibilidad (Playwright + axe)
docs/         Especificación, plan de desarrollo, diseño y guía de la presentación
```

Documentación:

- [`docs/Tekzaya_Especificacion.md`](docs/Tekzaya_Especificacion.md): qué hace el producto y por qué.
- [`docs/PLAN_DESARROLLO.md`](docs/PLAN_DESARROLLO.md): fases, decisiones tomadas y su porqué.
- [`docs/PRESENTACION.md`](docs/PRESENTACION.md): guía rápida para la defensa.
- [`docs/DESIGN.md`](docs/DESIGN.md): sistema de diseño.
