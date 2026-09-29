import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";
import { isValidTimeZone } from "@tekzaya/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");

// Un solo .env en la raíz del monorepo: la API y los scripts comparten configuración.
config({ path: path.join(repoRoot, ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/tekzaya"),

  // Zona horaria de operación de la empresa: define cuándo corre el reloj del SLA.
  // Solo es el valor inicial; una vez sembrados los ajustes, manda la base de datos.
  COMPANY_TIMEZONE: z.string().refine(isValidTimeZone, "Zona horaria desconocida").default("America/La_Paz"),

  // Se usan a partir de F2 y F5; opcionales para que la API arranque sin ellas.
  JWT_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  ALLOWED_GOOGLE_DOMAIN: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

// Una variable presente pero vacía en el .env equivale a no definirla.
const rawEnv = Object.fromEntries(
  Object.entries(process.env).map(([key, value]) => [key, value === "" ? undefined : value]),
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error("Configuración inválida en .env:");
  for (const issue of parsed.error.issues) {
    console.error(`  · ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
export { repoRoot };

// En desarrollo la aplicación arranca sin .env para no estorbar; en producción,
// firmar tokens con un secreto conocido sería un agujero, así que se exige.
const DEV_ONLY_SECRET = "tekzaya-solo-desarrollo-no-usar-en-produccion";
let warnedAboutSecrets = false;

function resolveSecret(value: string | undefined, name: string): string {
  if (value) return value;
  if (isProduction) {
    console.error(`Falta ${name} en .env y es obligatorio en producción.`);
    process.exit(1);
  }
  if (!warnedAboutSecrets) {
    console.warn("Secretos JWT de desarrollo: define JWT_SECRET y JWT_REFRESH_SECRET en .env");
    warnedAboutSecrets = true;
  }
  return `${DEV_ONLY_SECRET}-${name}`;
}

export const secrets = {
  access: resolveSecret(env.JWT_SECRET, "JWT_SECRET"),
  refresh: resolveSecret(env.JWT_REFRESH_SECRET, "JWT_REFRESH_SECRET"),
};

export const isGoogleConfigured = Boolean(env.GOOGLE_CLIENT_ID);
