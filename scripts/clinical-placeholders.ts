/**
 * 臨床佔位清單（M9、T-K）。只讀現有 content，唔改 reviewStatus，亦唔當任何人已簽核。
 * 有 reviewStatus 嘅列必須仍然係 PENDING_CLINICAL_REVIEW。
 * T1／T2／T3／T8 冇呢個欄位，但係臨床內容，一併列為未簽核。
 */
import { getContent } from '../src/content';
import { TABLE_NAMES, type TableName } from '../src/content/schema/tables';

export interface PlaceholderRow {
  table: TableName;
  id: string;
  reviewStatus: string;
}

export interface ClinicalPlaceholderReport {
  pending: PlaceholderRow[];
  other: PlaceholderRow[];
  /** 成張表都冇 reviewStatus */
  noField: TableName[];
  /** 冇簽核欄、但係臨床內容（T1、T2、T3、T8） */
  clinicalWithoutField: { table: TableName; ids: string[] }[];
  byTable: Record<string, number>;
}

/** T-K 要審、但 schema 未設 reviewStatus 嘅表 */
export const CLINICAL_TABLES_WITHOUT_FIELD = [
  'case-templates',
  'case-fsm',
  'trajectories',
  'rhythms',
] as const satisfies readonly TableName[];

function statusOf(row: object): string | null {
  if (!('reviewStatus' in row)) return null;
  const value = row.reviewStatus;
  return typeof value === 'string' ? value : null;
}

export function clinicalPlaceholders(): ClinicalPlaceholderReport {
  const tables = getContent().tables;
  const pending: PlaceholderRow[] = [];
  const other: PlaceholderRow[] = [];
  const noField: TableName[] = [];

  for (const name of TABLE_NAMES) {
    const rows = tables[name];
    const flagged = rows.filter((row) => 'reviewStatus' in row);
    if (flagged.length === 0) {
      noField.push(name);
      continue;
    }
    for (const row of flagged) {
      const reviewStatus = statusOf(row);
      const item = { table: name, id: row.id, reviewStatus: reviewStatus ?? 'MISSING' };
      if (reviewStatus === 'PENDING_CLINICAL_REVIEW') pending.push(item);
      else other.push(item);
    }
  }

  const byTable: Record<string, number> = {};
  for (const row of pending) byTable[row.table] = (byTable[row.table] ?? 0) + 1;

  const clinicalWithoutField = CLINICAL_TABLES_WITHOUT_FIELD.map((table) => ({
    table,
    ids: tables[table].map((row) => row.id),
  }));

  return { pending, other, noField, clinicalWithoutField, byTable };
}

const isDirect = process.argv[1]?.includes('clinical-placeholders') ?? false;
if (isDirect) {
  const report = clinicalPlaceholders();
  console.log(
    JSON.stringify(
      {
        pendingCount: report.pending.length,
        other: report.other,
        byTable: report.byTable,
        noField: report.noField,
        clinicalWithoutField: report.clinicalWithoutField,
      },
      null,
      2,
    ),
  );
}
