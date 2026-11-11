import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.CLIENT_PORT) || 5173,
    strictPort: !!process.env.CLIENT_PORT,
    host: true, // reachable from phones on the same Wi-Fi
    proxy: { '/api': `http://localhost:${process.env.API_PORT || 4000}` },
  },
});
