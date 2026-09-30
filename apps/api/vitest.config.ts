import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Base aparte: las pruebas borran las colecciones antes de cada archivo y no
    // deben tocar los datos semilla con los que se trabaja en local.
    env: {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://localhost:27017/tekzaya_test",
      UPLOAD_DIR: "uploads/test",
    },
    // Comparten una única base: en paralelo se pisarían las colecciones.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
