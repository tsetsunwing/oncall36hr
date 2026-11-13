# content-review

這些是「交出去覆核」的試算表，不是遊戲直接讀的檔案。遊戲讀的是 `src/content/data/`。

全部 CSV 用 UTF-8 並帶 BOM，Excel 直接開中文不會變亂碼。`content:import` 會自動去掉 BOM。

每張表第一行是欄名，下面有一至幾行範例，可以直接改成你的答案或刪掉。範例數字是佔位，未經臨床審核。

## 可以直接匯入的兩張

| 檔案              | 對應模板頁      | 怎麼用                                                 |
| ----------------- | --------------- | ------------------------------------------------------ |
| `case-review.csv` | 第六節 病例     | 加行 → `npm run content:import`                        |
| `drug-review.csv` | 第七節 藥物覆核 | 只匯入 `status=ACTIVE` 的行 → `npm run content:import` |

兩張都由指令產生：`npm run content:cases` 出 21 個現有病例，`npm run content:drugs` 出 1587 隻藥（已填類別預設值）。

⚠️ 這兩個匯出指令會**覆蓋**你改過的檔案。順序永遠是：先 import 舊的，再 export 新的。

## 其他六張（等內容交回來才接上引擎）

| 檔案                    | 對應模板頁             | 欄位重點                                                       |
| ----------------------- | ---------------------- | -------------------------------------------------------------- |
| `drug-renal.csv`        | 一、藥物腎劑量         | 每隻藥可多行，一個 eGFR 分級一行                               |
| `drug-interactions.csv` | 二、藥物相互作用       | 同一組合只寫一次，A＋B 與 B＋A 不要重複                        |
| `lab-catalog.csv`       | 三、第二階段化驗與影像 | 檢查清單；`aliases` 用分號分隔                                 |
| `lab-results.csv`       | 三、第二階段化驗與影像 | 報告內容；每個 `result_id` 都要有一行 `*`＋`*` 後備            |
| `ux-audit.csv`          | 四、畫面與 UX 稽核     | 一行只講一個問題                                               |
| `new-drug.csv`          | 五、新增藥物           | 一行同時寫藥典和醫囑兩張表；`DRUG` 類必須 `pharmacy_gate=true` |
| `lab-effects.csv`       | 五、化驗受影響規則     | `flag` 必須存在於某張醫囑的 `setsFlags`                        |

## 兩個容易踩的洞

1. 旗標（`sets_flags`）引擎不會讀 CSV。真正的旗標要寫在 `src/content/data/order-catalog.json` 的 `setsFlags`。
2. 診斷 id 只有 11 個，寫錯一個字就對不上：`pneumonia`、`sepsis`、`cellulitis`、`uti`、`copd`、`hypertension`、`heart-failure`、`gi-bleed`、`pe`、`acs`、`end-stage-malignancy`。
