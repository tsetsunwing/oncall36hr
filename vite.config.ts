import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { aiDevProxy } from './vite-plugins/aiDevProxy.ts';

export default defineConfig({
  plugins: [react(), aiDevProxy()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'test-support/**/*.test.ts', 'scripts/**/*.test.ts'],
    css: false,
  },
});
