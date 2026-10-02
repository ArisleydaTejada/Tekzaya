import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { connectMongo } from "./db/mongo";
import { startJobs } from "./jobs";
import { requeuePendingClassifications } from "./modules/ai/classification.queue";
import { attachRealtime } from "./realtime/realtime";

// No se espera a MongoDB: la API arranca igual y /health informa del estado real.
// Los trabajos programados sí esperan: sin base no tienen nada que revisar.
void connectMongo(env.MONGODB_URI).then(async () => {
  startJobs();
  // Lo que quedó sin clasificar en el arranque anterior vuelve a la cola.
  const pending = await requeuePendingClassifications();
  if (pending) console.log(`Tickets pendientes de clasificar reencolados: ${pending}`);
});

// El servidor HTTP se crea a mano porque Socket.IO necesita engancharse a él:
// `app.listen()` lo crea por dentro y no lo devuelve a tiempo.
const server = createServer(createApp());
attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(`API escuchando en http://localhost:${env.PORT}/api/v1`);
  console.log("Tiempo real activo en /socket.io");
});
