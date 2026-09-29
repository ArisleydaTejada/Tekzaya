import { createApp } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";

// No se espera a MongoDB: la API arranca igual y /health informa del estado real.
void connectMongo(env.MONGODB_URI);

createApp().listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}/api/v1`);
});
