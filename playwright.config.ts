import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 4173;
const MOCK_PORT = 8787;

export default defineConfig({
  testDir: './e2e',
  // 單一 worker：mock AI server 嘅重試計數同 /__reset 係全域狀態，desktop／mobile 同時行會互相干擾。
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${String(APP_PORT)}`,
    trace: 'retain-on-failure',
    locale: 'zh-HK',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-portrait', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run mock-ai',
      url: `http://127.0.0.1:${String(MOCK_PORT)}/health`,
      reuseExistingServer: !process.env.CI,
      env: { MOCK_AI_PORT: String(MOCK_PORT), MOCK_AI_KEY: 'test-key' },
    },
    {
      // 測試 production build（無 dev proxy）：瀏覽器直連 mock，驗證真實 CORS 路徑。
      command: `npm run build && npx vite preview --port ${String(APP_PORT)} --strictPort`,
      url: `http://127.0.0.1:${String(APP_PORT)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
