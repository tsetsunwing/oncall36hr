/**
 * 三張藥物效果 CSV 的列解析。數字來自 CSV，供玩家用試算表修改。
 * 這些數字是遊戲佔位，標 PENDING_CLINICAL_REVIEW，不是臨床指引。
 *
 * 這裡只做「文字 → 列」；驗證在 schema/csvTables.ts，套用邏輯在 drugEffects.ts。
 */

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
  id: string;
  classKey: string;
  note: string;
}

export interface DrugOverrideRow extends DoseBand {
  id: string;
  drug: string;
  status: string;
  /** ACTIVE 列生效時一併寫入病人狀態機的旗標，例如 ppi.iv、diuretic.iv。 */
  setsFlags: readonly string[];
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
  sets_flags: 'setsFlags',
  寫入旗標: 'setsFlags',
  id: 'id',
  label: 'label',
  名稱: 'label',
};

/** 比對藥名、單位、途徑。類別鍵不用這個，必須與資料完全相同。 */
export function normToken(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseCsv(text: string): Record<string, string>[] {
  const source = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
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

function tokens(record: Record<string, string>, key: string): string[] {
  return (record[key] ?? '')
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function band(record: Record<string, string>, where: string): DoseBand {
  const routes = tokens(record, 'ordinaryRoutes');
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
      id: classKey,
      classKey,
      ...band(record, classKey),
      note: record.note ?? '',
    });
  }
  const overrides: DrugOverrideRow[] = [];
  const seenDrugs = new Set<string>();
  for (const record of parseCsv(overridesText)) {
    const drug = required(record, 'drug', '藥物覆寫');
    const key = normToken(drug);
    if (seenDrugs.has(key)) throw new Error(`藥物覆寫重複：${drug}`);
    seenDrugs.add(key);
    overrides.push({
      id: drug,
      drug,
      status: required(record, 'status', drug),
      setsFlags: tokens(record, 'setsFlags'),
      ...band(record, drug),
      note: record.note ?? '',
    });
  }
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

/** 把三張 CSV 表併入其他內容表。瀏覽器同 Node 兩條路都用這一個，避免欄名走樣。 */
export function withDrugEffectTables(
  tables: Readonly<Record<string, unknown>>,
  parsed: DrugEffectTables,
): Record<string, unknown> {
  return {
    ...tables,
    'drug-class-effects': parsed.classes,
    'drug-effect-overrides': parsed.overrides,
    'effect-categories': parsed.categories,
  };
}
