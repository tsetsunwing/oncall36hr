# Layout G → Web Game migration plan

**Updated:** 2026-11-15 (countercheck + PR 19 Stage 2 shell status)  
**Canonical plan artifact:** `artifacts/plans/figma_layout_g_web_game_cb3442ba.plan.md`  
**Related:** `layout-g-figma-to-web-bridge-2026-11-14.md`, `layout-g-predeploy-checklist-2026-11-14.md`, `preferences.md`

---

## Status summary

| Stage | Scope | Status |
|---|---|---|
| 1 | Design tokens + static assets | **Done** — [PR 18](https://github.com/tsetsunwing/oncall36hr/pull/18) |
| 2 | Demo shell `#/demo/layout-g` (floors → landmarks → Bed Zoom → phone/menus/start-end) | **Done on GitHub** — [PR 19](https://github.com/tsetsunwing/oncall36hr/pull/19) (`cursor/layout-g-shell-de33`, stacked on #18). Open; await Eric merge. |
| 3 | Engine / `gameView` wiring; reuse production libs | Pending |
| 4 | Visual QA + publish demo → production shell swap | Pending |

**Product decisions (locked):**
- Demo-first at `#/demo/layout-g` (not direct WardGame replace).
- Demo C **absent** from the Layout G stack (PR 17 closed unmerged; never on #18/#19).
- Production drug library, cardiac monitor, and Observe/Test/Treat/Resus menus **kept and reused** on PR 19.
- Live reference: https://tsetsunwing.github.io/oncall36hr/#/game?mode=NIGHT&difficulty=MEDIUM&rank=MO&ward=MED

Figma: https://www.figma.com/design/KvxouGZszS77hHkQgU329e

---

## Hard rules

1. New work lives under `src/demo/layout-g/` until Stage 3–4.
2. Production paths to **keep and reuse**: formulary / drug order UI, `MonitorPanel`, Observe / Test / Treat / Resus menus.
3. Asset URLs are repo-relative: `public/demo/layout-g/…` (no ephemeral `/home/ubuntu/.cursor/…` paths).
4. Stage 2 build order follows bridge §E — floors and landmarks are first-class (delivered on PR 19).

---

## Stage 1 — on GitHub (PR 18)

Branch: `cursor/layout-g-demo-3bfe`

- `src/demo/layout-g/layout-g.css`
- Base `public/demo/layout-g/` night floors, landmarks, isometric, ECG, body silhouette

---

## Stage 2 — on GitHub (PR 19)

Branch: `cursor/layout-g-shell-de33` (stacked on #18)

Delivered:
- `#/demo/layout-g` + StartPage entry
- Screens: start/setup → Zone A/B floor (day+night + MEWS hotspots) ↔ landmarks (3 actions, **no dock**) → bed zoom (panels + **dock only here**) → phone / round / end
- Reuses production `MonitorPanel`, `ObservePanel`, `OxygenOrderForm`, `CatheterOrders`, `DrugOrderForm`, `RESUS_MENU` / `TEST_MENU_*`
- Extra assets: zone day, landmark day/night, bedzoom-1…8
- Demo C paths absent; production `#/game` unchanged

**Still open for Stage 2:** Eric click-through / Figma visual QA; merge when Eric says so.

---

## Stage 3 — engine (pending)

Swap `fakeData` → `gameView.ts`. Keep production order pipelines. Feature-flag or replace WardGame shell only after demo QA.

---

## Stage 4 — QA / deploy (pending)

Lint, typecheck, vitest, visual side-by-side vs Figma. Publish via PR merge → GitHub Pages, then consider main UI swap. No force-push.

---

## GitHub vs pending

| Already on GitHub | Still pending |
|---|---|
| Stage 1 tokens + base assets ([PR 18](https://github.com/tsetsunwing/oncall36hr/pull/18)) | Stage 3 engine wiring |
| Stage 2 shell + day/bedzoom assets + menu reuse ([PR 19](https://github.com/tsetsunwing/oncall36hr/pull/19)) | Stage 4 visual QA + merge/publish + main shell swap |
| Migration plan ([PR 21](https://github.com/tsetsunwing/oncall36hr/pull/21)) | — |
| Production libs kept; demo C absent | — |

---

## Out of scope for “100% Figma”

Engine/sim logic, AI dialogue, save/load; pixel-identical fonts; every rare drug/lab row without scroll.
