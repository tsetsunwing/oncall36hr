/**
 * 治療藥物的佔位效果表。數字來自三張 CSV，經 validateContent 驗證。
 * 這些數字是遊戲佔位，標 PENDING_CLINICAL_REVIEW，不是臨床指引。
 */
import { getContent } from './index';
import {
  normToken,
  presetOf,
  type ClassEffectRow,
  type DoseBand,
  type DrugEffectTables,
  type DrugOverrideRow,
  type EffectCategoryRow,
  type VitalPreset,
} from './drugEffectRows';

export {
  UNLISTED_DRUG_CATALOG_ID,
  normToken,
  parseCsv,
  parseDrugEffectTables,
  presetOf,
} from './drugEffectRows';
export type {
  ClassEffectRow,
  DoseBand,
  DrugEffectTables,
  DrugOverrideRow,
  EffectCategoryRow,
  VitalPreset,
} from './drugEffectRows';

export function getDrugEffectTables(): DrugEffectTables {
  const tables = getContent().tables;
  return {
    classes: tables['drug-class-effects'],
    overrides: tables['drug-effect-overrides'],
    categories: tables['effect-categories'],
  };
}

/** classes 由前往後，用第一個在表裡有列的類別。 */
export function classRowFor(
  classNames: readonly string[],
  rows: readonly ClassEffectRow[],
): ClassEffectRow | undefined {
  const byKey = new Map(rows.map((row) => [row.classKey, row]));
  for (const name of classNames) {
    const row = byKey.get(name);
    if (row) return row;
  }
  return undefined;
}

export function activeOverrideFor(
  drugName: string,
  rows: readonly DrugOverrideRow[],
): DrugOverrideRow | undefined {
  const key = normToken(drugName);
  return rows.find((row) => row.status === 'ACTIVE' && normToken(row.drug) === key);
}

export function doseInBand(
  dose: { value: number; unit: string } | null,
  route: string | null,
  row: DoseBand,
): boolean {
  if (!dose || !route || !Number.isFinite(dose.value)) return false;
  if (normToken(dose.unit) !== normToken(row.doseUnit)) return false;
  if (dose.value < row.usualDoseMin || dose.value > row.usualDoseMax) return false;
  const routes = new Set(row.ordinaryRoutes.map((item) => normToken(item)));
  return routes.has(normToken(route));
}

export type DrugPresetDecision =
  | { kind: 'preset'; preset: VitalPreset; classKey: string | null; flags: readonly string[] }
  | { kind: 'ai' };

/**
 * 沒有對到藥典時才用。
 * ACTIVE 覆寫取代類別。劑量或途徑不合、沒有類別、或類別沒有列，走 AI。
 */
export function resolveDrugPreset(
  drug: { name: string; classes: readonly string[] },
  dose: { value: number; unit: string } | null,
  route: string | null,
  tables: DrugEffectTables,
): DrugPresetDecision {
  const override = activeOverrideFor(drug.name, tables.overrides);
  if (override) {
    if (!doseInBand(dose, route, override)) return { kind: 'ai' };
    return {
      kind: 'preset',
      preset: presetOf(override),
      classKey: null,
      flags: override.setsFlags,
    };
  }
  const row = classRowFor(drug.classes, tables.classes);
  if (!row || !doseInBand(dose, route, row)) return { kind: 'ai' };
  return { kind: 'preset', preset: presetOf(row), classKey: row.classKey, flags: [] };
}

export function categoryPreset(
  id: string,
  rows: readonly EffectCategoryRow[],
): VitalPreset | undefined {
  const row = rows.find((item) => item.id === id);
  if (!row) return undefined;
  return {
    sbp: row.deltaSbp,
    hr: row.deltaHr,
    rr: row.deltaRr,
    temp: row.deltaTempC,
  };
}
