# 單獨值夜

Vite + React 18 + TypeScript（strict）純前端遊戲。目前進度：**M0 專案骨架**（見 `implementation-plan.md` §16）。

## 指令

| 指令                        | 用途                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `npm run dev`               | 開發伺服器（含 `/ai-proxy/*` 開發代理）                          |
| `npm run mock-ai`           | 本地 mock OpenAI-compatible server（預設 :8787，key `test-key`） |
| `npm run check`             | Prettier、ESLint、typecheck、模組邊界、內容驗證、單元測試        |
| `npm run boundaries:verify` | 故意寫入違規檔案，確認 ESLint／dependency-cruiser 會擋           |
| `npm run test:e2e`          | Playwright（桌面＋手機直向）＋ axe                               |

## 模組邊界

`engine`（純 TS，禁用 `Math.random`、`Date`、`fetch` 等）← `ai`（只可 import engine 型別）；`view` → `ui`；`storage`、`content`、`i18n` 為葉層；`app` 為組裝根。規則在 `eslint.config.js` 與 `.dependency-cruiser.cjs`。

## 設計者預設值與字串

- 全部預設數值：`src/content/config/config.json`（zod 驗證）。
- 介面字串（書面語）：`src/i18n/zh-Hant.ts`；角色對白（粵語）：`src/i18n/dialogue.zh-Hant.ts`。
