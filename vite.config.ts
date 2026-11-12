import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { aiDevProxy } from './vite-plugins/aiDevProxy.ts';

// GitHub Pages 部署在 /<repo>/ 之下；本機開發與預覽保持根路徑。
const base = process.env.GITHUB_PAGES ? '/oncall36hr/' : '/';

export default defineConfig({
  base,
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
