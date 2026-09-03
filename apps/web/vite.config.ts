import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The repository keeps one .env at its root, so Vite is pointed there rather than
  // requiring a second copy inside this package.
  envDir: path.resolve(here, '../..'),
  server: {
    port: 5173,
    // Bound to all interfaces so the app can be opened from a phone on the same network,
    // which is how it is meant to be used.
    host: true,
    /*
     * The API is proxied under the same origin as the app.
     *
     * This is what makes the app work from a phone. Calling the API at an absolute
     * http://localhost:4000 would resolve to the *phone* rather than the dev machine, and
     * calling it by LAN address would need a CORS exception for every device. Proxying
     * keeps every request same-origin, so the app works identically on the laptop and on a
     * phone at http://<machine-ip>:5173 with no configuration.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
