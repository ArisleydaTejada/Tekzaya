import { defineConfig, devices } from "@playwright/test";

/**
 * Recorridos de la defensa de punta a punta (F8).
 *
 * Levanta su propia API y su propia web, en puertos distintos de los de `npm run
 * dev` y sobre una base aparte (`tekzaya_e2e`): se pueden correr con la demo
 * abierta sin tocar sus datos. La API arranca SIN clave de Gemini, así que toda
 * la suite prueba de paso el modo sin IA, que es el respaldo de la presentación.
 */
const API_PORT = 4100;
const WEB_PORT = 5174;

const apiEnv = {
  NODE_ENV: "test",
  PORT: String(API_PORT),
  MONGODB_URI: "mongodb://localhost:27017/tekzaya_e2e",
  UPLOAD_DIR: "uploads/e2e",
  WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
  // Vacías a propósito: una variable presente gana a la del .env.
  GEMINI_API_KEY: "",
  GOOGLE_CLIENT_ID: "",
};

export default defineConfig({
  testDir: "e2e",
  // Comparten base de datos: en paralelo, un recorrido movería los tickets de otro.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "es-ES",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],

  webServer: [
    {
      // La semilla va en el mismo comando que el arranque: así está garantizado
      // que la base está lista antes de la primera petición.
      command: "npx tsx apps/api/src/seed/seed.ts && npx tsx apps/api/src/index.ts",
      url: `http://localhost:${API_PORT}/api/v1/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: `npm run dev --workspace @tekzaya/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
