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
    // Vite otherwise rejects requests whose Host header it doesn't recognize.
    // A leading-dot entry matches the host and all its subdomains, so a new random
    // ngrok URL works without editing this file — you just need to restart Vite
    // once after adding this (vite.config.ts changes are NOT hot-reloaded).
    allowedHosts: ['.ngrok-free.app', '.ngrok.app', 'localhost', '127.0.0.1','a136-103-225-205-106.ngrok-free.app'],
    proxy: {
      // Same-origin API access: the browser calls /api/* on whatever origin the
      // app is served from (localhost OR the https ngrok URL), and Vite forwards
      // it to the backend. This avoids mixed-content blocking when the page is
      // loaded over https through a tunnel while the API runs on plain http.
      '/api': {
        target: 'http://localhost:4000',
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
