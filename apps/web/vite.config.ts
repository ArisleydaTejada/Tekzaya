import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // El navegador llama siempre a rutas relativas /api/**; el proxy evita CORS
    // en desarrollo y deja la misma URL lista para producción.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // El socket necesita `ws: true`: sin él el proxy reenvía el sondeo HTTP pero
      // no deja pasar la actualización a websocket, y la conexión se queda colgada.
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
