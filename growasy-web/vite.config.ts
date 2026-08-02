/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Allow the app to be served through an ngrok (or any) tunnel host during dev.
    // A leading-dot entry matches the host and all its subdomains, so a new random
    // ngrok URL works without editing this file — you just need to restart Vite
    // once after adding this (vite.config.ts changes are NOT hot-reloaded).
    //
    // NOTE: `allowedHosts` (and the Host-header check it relaxes) only exists in
    // Vite >= 6. On the Vite 5 pinned here there is no host check at all, so this
    // is inert — kept, via the spread cast, so tunnels keep working after an
    // upgrade instead of suddenly 403-ing. The cast is what stops Vite 5's
    // ServerOptions type from rejecting the unknown key.
    ...({
      allowedHosts: ['.ngrok-free.app', '.ngrok.app', 'localhost', '127.0.0.1'],
    } as Record<string, unknown>),
    // Inside the docker dev stack the host filesystem is a bind mount, where
    // inotify events don't reach the container — compose sets this to poll.
    watch: process.env.CHOKIDAR_USEPOLLING ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      // Same-origin API access: the browser calls /api/* on whatever origin the
      // app is served from (localhost OR the https ngrok URL), and Vite forwards
      // it to the backend. This avoids mixed-content blocking when the page is
      // loaded over https through a tunnel while the API runs on plain http.
      //
      // Default targets the API on the host (plain `npm run dev`). The docker
      // dev stack sets VITE_PROXY_TARGET=http://api:4000, since `localhost`
      // inside the web container is the container itself, not the API.
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/'],
    },
  },
});
