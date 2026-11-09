/**
 * 治療藥物的佔位效果表。數字來自 CSV，供玩家用試算表修改。
 * 這些數字是遊戲佔位，標 PENDING_CLINICAL_REVIEW，不是臨床指引。
 */
import categoryCsv from './data/effect-categories.csv?raw';
import classCsv from './data/drug-class-effects.csv?raw';
import overrideCsv from './data/drug-effect-overrides.csv?raw';

/** 治療彈窗裡對不到藥典的藥，落這張目錄醫囑，再由類別表或效果類別改基線。 */
export const UNLISTED_DRUG_CATALOG_ID = 'drug.unlisted';

export interface VitalPreset {
  sbp: number;
  hr: number;
  rr: number;
  temp: number;
}

export interface DoseBand {
  usualDoseMin: number;
  usualDoseMax: number;
  doseUnit: string;
  ordinaryRoutes: readonly string[];
  deltaSbp: number;
  deltaHr: number;
  deltaRr: number;
  deltaTempC: number;
}

export interface ClassEffectRow extends DoseBand {
  classKey: string;
  note: string;
}

export interface DrugOverrideRow extends DoseBand {
  drug: string;
  status: string;
  note: string;
}

export interface EffectCategoryRow {
  id: string;
  label: string;
  deltaSbp: number;
  deltaHr: number;
  deltaRr: number;
  deltaTempC: number;
  note: string;
}

export interface DrugEffectTables {
  classes: readonly ClassEffectRow[];
  overrides: readonly DrugOverrideRow[];
  categories: readonly EffectCategoryRow[];
}

const HEADER: Readonly<Record<string, string>> = {
  class: 'class',
  類別: 'class',
  usual_dose_min: 'usualDoseMin',
  常用劑量下限: 'usualDoseMin',
  usual_dose_max: 'usualDoseMax',
  常用劑量上限: 'usualDoseMax',
  dose_unit: 'doseUnit',
  劑量單位: 'doseUnit',
  ordinary_routes: 'ordinaryRoutes',
  常用途徑: 'ordinaryRoutes',
  delta_sbp: 'deltaSbp',
  收縮壓變化: 'deltaSbp',
  delta_hr: 'deltaHr',
  心率變化: 'deltaHr',
  delta_rr: 'deltaRr',
  呼吸變化: 'deltaRr',
  delta_temp_c: 'deltaTempC',
  體溫變化: 'deltaTempC',
  note: 'note',
  備註: 'note',
  drug: 'drug',
  藥名: 'drug',
  status: 'status',
  狀態: 'status',
  id: 'id',
  label: 'label',
  名稱: 'label',
};

/** 比對藥名、單位、途徑。類別鍵不用這個，必須與資料完全相同。 */
export function normToken(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseCsv(text: string): Record<string, string>[] {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index] ?? '';
    if (quoted) {
      if (ch === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell.trim().length > 0)) rows.push(row);
  }
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    header.forEach((key, cell) => {
      const canonical = HEADER[key.trim()];
      if (!canonical) return;
      record[canonical] = (cells[cell] ?? '').trim();
    });
    return record;
  });
}

function required(record: Record<string, string>, key: string, where: string): string {
  const value = record[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`${where} 缺少 ${key}`);
  }
  return value;
}

function numeric(record: Record<string, string>, key: string, where: string): number {
  const value = Number(required(record, key, where));
  if (!Number.isFinite(value)) throw new Error(`${where} 的 ${key} 不是數字`);
  return value;
}

function band(record: Record<string, string>, where: string): DoseBand {
  const routes = required(record, 'ordinaryRoutes', where)
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (routes.length === 0) throw new Error(`${where} 沒有常用途徑`);
  return {
    usualDoseMin: numeric(record, 'usualDoseMin', where),
    usualDoseMax: numeric(record, 'usualDoseMax', where),
    doseUnit: required(record, 'doseUnit', where),
    ordinaryRoutes: routes,
    deltaSbp: numeric(record, 'deltaSbp', where),
    deltaHr: numeric(record, 'deltaHr', where),
    deltaRr: numeric(record, 'deltaRr', where),
    deltaTempC: numeric(record, 'deltaTempC', where),
  };
}

export function presetOf(bandRow: DoseBand): VitalPreset {
  return {
    sbp: bandRow.deltaSbp,
    hr: bandRow.deltaHr,
    rr: bandRow.deltaRr,
    temp: bandRow.deltaTempC,
  };
}

export function parseDrugEffectTables(
  classesText: string,
  overridesText: string,
  categoriesText: string,
): DrugEffectTables {
  const classes: ClassEffectRow[] = [];
  const seenClasses = new Set<string>();
  for (const record of parseCsv(classesText)) {
    const classKey = required(record, 'class', '類別表');
    if (seenClasses.has(classKey)) throw new Error(`類別重複：${classKey}`);
    seenClasses.add(classKey);
    classes.push({
      classKey,
      ...band(record, classKey),
      note: record.note ?? '',
    });
  }
  const overrides = parseCsv(overridesText).map((record) => {
    const drug = required(record, 'drug', '藥物覆寫');
    return {
      drug,
      status: required(record, 'status', drug),
      ...band(record, drug),
      note: record.note ?? '',
    };
  });
  const categories: EffectCategoryRow[] = [];
  const seenIds = new Set<string>();
  for (const record of parseCsv(categoriesText)) {
    const id = required(record, 'id', '效果類別');
    if (seenIds.has(id)) throw new Error(`效果類別重複：${id}`);
    seenIds.add(id);
    categories.push({
      id,
      label: required(record, 'label', id),
      deltaSbp: numeric(record, 'deltaSbp', id),
      deltaHr: numeric(record, 'deltaHr', id),
      deltaRr: numeric(record, 'deltaRr', id),
      deltaTempC: numeric(record, 'deltaTempC', id),
      note: record.note ?? '',
    });
  }
  return { classes, overrides, categories };
}

let cached: DrugEffectTables | undefined;

export function getDrugEffectTables(): DrugEffectTables {
  cached ??= parseDrugEffectTables(classCsv, overrideCsv, categoryCsv);
  return cached;
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
  | { kind: 'preset'; preset: VitalPreset; classKey: string | null }
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
    return { kind: 'preset', preset: presetOf(override), classKey: null };
  }
  const row = classRowFor(drug.classes, tables.classes);
  if (!row || !doseInBand(dose, route, row)) return { kind: 'ai' };
  return { kind: 'preset', preset: presetOf(row), classKey: row.classKey };
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
