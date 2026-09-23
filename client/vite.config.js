import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-time proxy so the React app can call /api/* without hardcoding the
// backend's port, and without CORS getting in the way while developing.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
