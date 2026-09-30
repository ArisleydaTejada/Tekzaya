import { createApp } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { startJobs } from "./jobs";

// No se espera a MongoDB: la API arranca igual y /health informa del estado real.
// Los trabajos programados sí esperan: sin base no tienen nada que revisar.
void connectMongo(env.MONGODB_URI).then(startJobs);

createApp().listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}/api/v1`);
});
