/**
 * 三張 CSV 表在瀏覽器 bundle 的入口。Vite 讀 ?raw，再由 parseDrugEffectTables 轉成列。
 * Node（tsx scripts）唔識 ?raw，所以 scripts/node-content.ts 直接由磁碟讀同一批檔案。
 */
import classEffectsCsv from './data/drug-class-effects.csv?raw';
import drugEffectOverridesCsv from './data/drug-effect-overrides.csv?raw';
import effectCategoriesCsv from './data/effect-categories.csv?raw';
import { parseDrugEffectTables, type DrugEffectTables } from './drugEffectRows';

export const csvTables: DrugEffectTables = parseDrugEffectTables(
  classEffectsCsv,
  drugEffectOverridesCsv,
  effectCategoriesCsv,
);
