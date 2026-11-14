# Layout G → Web Game migration plan

**Updated:** 2026-11-15 (countercheck vs PR 18, bridge doc, Eric keep-libs rule)  
**Canonical plan artifact:** `artifacts/plans/figma_layout_g_web_game_cb3442ba.plan.md`  
**Related:** `layout-g-figma-to-web-bridge-2026-11-14.md`, `layout-g-predeploy-checklist-2026-11-14.md`, `preferences.md`

---

## Status summary

| Stage | Scope | Status |
|---|---|---|
| 1 | Design tokens + static assets | **Done** — [PR 18](https://github.com/tsetsunwing/oncall36hr/pull/18) |
| 2 | Demo shell `#/demo/layout-g` (floors → landmarks → Bed Zoom → phone/menus) | **Pending** — SN-138 shell worker |
| 3 | Engine / `gameView` wiring; reuse production libs | Pending |
| 4 | QA + publish demo → production shell swap | Pending |

**Product decisions (locked):**
- Demo-first at `#/demo/layout-g` (not direct WardGame replace).
- Delete **only** Concept C demo (`src/demo/layout-c`, `#/demo/layout-c`). PR 17 closed unmerged.
- **Never** delete production drug library, cardiac monitor design, or Observe/Test/Treat/Resus menus before migration is finished — **reuse** them in Layout G.
- Live reference: https://tsetsunwing.github.io/oncall36hr/#/game?mode=NIGHT&difficulty=MEDIUM&rank=MO&ward=MED

Figma: https://www.figma.com/design/KvxouGZszS77hHkQgU329e

---

## Hard rules

1. New work lives under `src/demo/layout-g/` until Stage 3–4.
2. Production paths to **keep and reuse**: formulary / drug order UI, `MonitorPanel` (cardiac monitor), Observe / Test / Treat / Resus menus and order panels.
3. Asset URLs are repo-relative: `public/demo/layout-g/…` (no ephemeral `/home/ubuntu/.cursor/…` paths).
4. Stage 2 build order follows bridge §E — floors and landmarks are not optional polish after Bed Zoom.

---

## Stage 1 — on GitHub (PR 18)

Branch: `cursor/layout-g-demo-3bfe`

- `src/demo/layout-g/layout-g.css` — tokens + primitives
- `public/demo/layout-g/`
  - `isometric-hospital.png`
  - `ecg-wave.svg`
  - `body-silhouette.svg`
  - `zone-a-night.jpg` / `zone-b-night.jpg`
  - `landmark-pantry.jpg` / `landmark-rest.jpg` / `landmark-wc.jpg`

**Still to upload (Stage 2 asset follow-ups):** floor/landmark **day** variants; Bed Zoom demographic set; hotspot JSON from `layout-g-hotspots-2026-11-14.md`.

---

## Stage 2 — demo shell (pending SN-138)

Aligned with bridge §B / §E:

1. **2a** Shell + HUD + Floor A/B **night** + hotspots + MEWS + route `#/demo/layout-g`
2. **2b** Day/night + landmarks (pantry/rest/WC) + 3 self-care actions (no dock)
3. **2c** Bed Zoom panels + bottom dock only here
4. **2d** Wire dock to **production** Observe/Test/Treat/Resus trees
5. **2e** Phone chat + Doctor Round
6. **2f** Start / End pages

When the demo route is live, remove **only** demo C. Do not gut `src/ui` production clinical code.

---

## Stage 3 — engine

Swap `fakeData` → `gameView.ts` mappings. Keep production order pipelines for drugs, observe, tests, resus. Feature-flag or replace WardGame shell only after demo QA.

---

## Stage 4 — QA / deploy

Lint, typecheck, vitest, visual side-by-side vs Figma (bridge §D). Publish demo via PR → GitHub Pages, then consider main UI swap. No force-push.

---

## GitHub vs pending

| Already on GitHub | Still pending |
|---|---|
| Stage 1 tokens + night/landmark/isometric/ECG/body assets (PR 18) | Stage 2 React shell / route (SN-138) |
| This migration plan doc (stacked PR off PR 18) | Day art, bedzoom demographics, hotspot JSON files |
| Production game on Pages (keep libs) | Demo C deletion; production shell swap |

---

## Out of scope for “100% Figma”

Engine/sim logic, AI dialogue, save/load; pixel-identical fonts; every rare drug/lab row without scroll.
