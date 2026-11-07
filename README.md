# 單獨值夜

Vite + React 18 + TypeScript（strict）純前端遊戲。目前進度：**M2 單病人垂直切片**（M0 骨架、M1 Engine 核心已完成）（見 `implementation-plan.md` §16）。

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

## M2 單病人切片：點樣玩同點樣驗證

- 開局：`/#/` 設定 API（或用 mock：`npm run mock-ai`，key `test-key`，model 名稱控制行為，例如 `mock-ok`、`mock-prompt-injection`、`mock-fail-twice`），再 `開始`。可加 `?seed=xxx` 固定種子。
- 病人狀態、生命表徵、MEWS、order 效果全部由 `src/content/data/*.json` 表驅動；AI 只輸出「理解」（`order.parse`、`dialogue.turn`），數字一律用 `{{token}}`，由 engine 於排隊時凍結。
- 已知待辦（M2 範圍外）：MEWS SpO2 分段／band 為 placeholder（`PENDING_CLINICAL_REVIEW`）、無心臟停頓／ACLS、無讀檔 UI、重新載入不會重發 pending AI 請求。

## M4 病房：20 床、電話、人手

- 預設開局為病房模式（20 床固定平面圖、護士分區、共用電話、下屬委派）。網址參數（測試與預覽用）：`seed`、`mode=DAY|NIGHT|ONCALL`、`difficulty=EASY|MEDIUM|HARD`、`rank=HO|MO|RES`、`callrate=<每小時來電基數>`、`ward=single`（舊式單一病人）。
- 病人組合、來電量（T12：+0／+10／+20%）、下屬可靠度與速度、職級反應全部由 `src/content/data/*.json` 與 `config.json` 驅動；engine 在 `src/engine/ward/`，介面在 `src/ui/ward/`。
- 下屬能力（level）只存在於 engine 內，從不進入 view、介面或 AI context；玩家只能由實際表現判斷。
- 電話對白與 SBAR 預填由 engine 以模板產生（M4 未新增 AI contract）；所有臨床／平衡數值均標 `PENDING_CLINICAL_REVIEW`。
