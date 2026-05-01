import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true
      },
      '/collab': {
        target: 'ws://localhost:4000',
        ws: true
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    // y-protocols has no root export — removing it from here fixes the Vite error.
    // y-websocket internally imports y-protocols/*, which Vite handles fine on its own.
    include: ['yjs', 'y-websocket']
  }
});