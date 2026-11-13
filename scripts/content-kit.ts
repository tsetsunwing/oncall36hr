/**
 * 內容工具：把「要覆核的內容」匯出成試算表，改完再匯入。
 * 生成器只會產生骨架同預設值，唔會自己發明臨床數字；
 * 未覆核嘅一律 PENDING_CLINICAL_REVIEW。
 *
 *   tsx scripts/content-kit.ts drugs:export   → content-review/drug-review.csv（1587 隻藥）
 *   tsx scripts/content-kit.ts drugs:import   → 寫入 drug-effect-overrides.csv（只收 status=ACTIVE）
 *   tsx scripts/content-kit.ts cases:export   → content-review/case-review.csv（現有病例做例子）
 *   tsx scripts/content-kit.ts cases:import   → 由 CSV 新增病例（case-templates + case-fsm + trajectories）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/content/drugEffectRows';

const DIR = 'content-review';
const DRUG_CSV = join(DIR, 'drug-review.csv');
const CASE_CSV = join(DIR, 'case-review.csv');
const DATA = 'src/content/data';

const DRUG_COLUMNS = [
  'drug_id',
  'name',
  'listed_name',
  'chapter',
  'class',
  'dose_min',
  'dose_max',
  'dose_unit',
  'routes',
  'delta_sbp',
  'delta_hr',
  'delta_rr',
  'delta_temp_c',
  'sets_flags',
  'status',
  'note',
] as const;

const CASE_COLUMNS = [
  'case_id',
  'wards',
  'name',
  'age',
  'sex',
  'code',
  'complaint',
  'diagnosis_id',
  'past_history',
  'known_diagnoses',
  'allergies',
  'reversible_cause_ids',
  'complexity',
  'initial_state',
  'deteriorate_after_min',
  'arrest_rhythm',
  'death_cause',
  'symptoms_initial',
  'symptoms_deteriorating',
] as const;

type Row = Record<string, string>;

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split('|')
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

/** 原樣讀 CSV（保留你寫的欄名），唔會經藥典嘅欄名對照表。 */
function parseTable(text: string): Row[] {
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
  const keys = header.map((key) => key.trim());
  return rows.slice(1).map((cells) => {
    const record: Row = {};
    keys.forEach((key, index) => {
      if (key === '') return;
      record[key] = (cells[index] ?? '').trim();
    });
    return record;
  });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

/** 由 unknown 安全取字串；唔係字串就當空白，避免 [object Object]。 */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => text(v)).filter((v) => v !== '') : [];
}

/** 由 CSV 某欄取字串；空白就用預設值。 */
function pick(row: Row, key: string, fallback: string): string {
  const value = row[key];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** UTF-8 連 BOM，Excel 直接開中文唔會變亂碼。parseTable 會去掉 BOM。 */
function writeCsvFile(path: string, text: string): void {
  const body = text.startsWith('\uFEFF') ? text : `\uFEFF${text}`;
  writeFileSync(path, body, 'utf8');
}

function quote(value: string): string {
  return /[",\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function toCsv(columns: readonly string[], rows: readonly Row[]): string {
  const head = columns.join(',');
  const body = rows.map((row) => columns.map((c) => quote(row[c] ?? '')).join(','));
  return `${[head, ...body].join('\n')}\n`;
}

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR);
}

interface ClassRow extends Row {
  class: string;
  usual_dose_min: string;
  usual_dose_max: string;
  dose_unit: string;
  ordinary_routes: string;
  delta_sbp: string;
  delta_hr: string;
  delta_rr: string;
  delta_temp_c: string;
}

interface TreatmentDrug {
  id: string;
  name: string;
  listedName: string;
  chapter: string;
  classes: string[];
  column: string;
}

function drugsExport(): void {
  const drugs = (readJson(join(DATA, 'treatment-drugs.json')) as { rows: TreatmentDrug[] }).rows;
  const classes = parseCsv(
    readFileSync(join(DATA, 'drug-class-effects.csv'), 'utf8'),
  ) as ClassRow[];
  const byClass = new Map(classes.map((row) => [row.class, row]));
  const rows: Row[] = drugs.map((drug) => {
    const cls = drug.classes.map((name) => byClass.get(name)).find((row) => row !== undefined);
    return {
      drug_id: drug.id,
      name: drug.name,
      listed_name: drug.listedName,
      chapter: drug.chapter,
      class: cls?.class ?? '',
      dose_min: cls?.usual_dose_min ?? '',
      dose_max: cls?.usual_dose_max ?? '',
      dose_unit: cls?.dose_unit ?? '',
      routes: cls?.ordinary_routes ?? '',
      delta_sbp: cls?.delta_sbp ?? '',
      delta_hr: cls?.delta_hr ?? '',
      delta_rr: cls?.delta_rr ?? '',
      delta_temp_c: cls?.delta_temp_c ?? '',
      sets_flags: '',
      status: '',
      note: cls ? 'PENDING_CLINICAL_REVIEW' : 'NO_CLASS_MATCH',
    };
  });
  ensureDir();
  writeCsvFile(DRUG_CSV, toCsv(DRUG_COLUMNS, rows));
  const unmatched = rows.filter((row) => row.class === '').length;
  console.log(`✅ ${DRUG_CSV}：${String(rows.length)} 隻藥（${String(unmatched)} 隻對不到分類）`);
}

function drugsImport(): void {
  if (!existsSync(DRUG_CSV)) throw new Error(`找唔到 ${DRUG_CSV}，先跑 drugs:export`);
  const rows = parseTable(readFileSync(DRUG_CSV, 'utf8'));
  const active = rows.filter((row) => (row.status ?? '').trim().toUpperCase() === 'ACTIVE');
  if (active.length === 0) {
    console.log('ℹ️ 冇 status=ACTIVE 嘅藥，沒有改動。');
    return;
  }
  const path = join(DATA, 'drug-effect-overrides.csv');
  const head = readFileSync(path, 'utf8').split('\n')[0] ?? '';
  const existing = parseTable(readFileSync(path, 'utf8'));
  const kept = existing.filter(
    (row) =>
      !active.some(
        (drug) => (drug.name ?? '').trim().toLowerCase() === (row.drug ?? '').trim().toLowerCase(),
      ),
  );
  const added: Row[] = active.map((row, index) => ({
    id: `ovr.gen.${String(index + 1)}`,
    drug: row.name ?? '',
    usual_dose_min: row.usual_dose_min ?? '',
    usual_dose_max: row.usual_dose_max ?? '',
    dose_unit: row.dose_unit ?? '',
    ordinary_routes: row.ordinary_routes ?? '',
    delta_sbp: row.delta_sbp ?? '',
    delta_hr: row.delta_hr ?? '',
    delta_rr: row.delta_rr ?? '',
    delta_temp_c: row.delta_temp_c ?? '',
    sets_flags: row.sets_flags ?? '',
    status: 'ACTIVE',
    note: pick(row, 'note', 'PENDING_CLINICAL_REVIEW'),
  }));
  const columns = head.split(',');
  writeFileSync(path, toCsv(columns, [...kept, ...added]), 'utf8');
  console.log(`✅ ${path}：新增／更新 ${String(added.length)} 隻藥`);
}

interface CaseTemplate {
  id: string;
  wards?: string[];
  [key: string]: unknown;
}

interface CaseStateRow {
  trajectory?: string;
  arrest?: { rhythm?: string };
  pain?: unknown;
  agitation?: unknown;
  nausea?: unknown;
}

interface CaseFsmRow {
  id: string;
  initial: string;
  states: Record<string, CaseStateRow>;
  transitions?: { from: string; to: string; when?: { timeInStateSec?: number } }[];
}

function firstTimeInStateSec(fsm: CaseFsmRow | undefined): string {
  const sec = fsm?.transitions?.find((t) => typeof t.when?.timeInStateSec === 'number')?.when
    ?.timeInStateSec;
  return sec === undefined ? '' : String(Math.round(sec / 60));
}

function arrestRhythm(fsm: CaseFsmRow | undefined): string {
  const states = fsm ? Object.values(fsm.states) : [];
  return states.find((st) => st.arrest?.rhythm !== undefined)?.arrest?.rhythm ?? '';
}

function symptomsText(t: CaseTemplate, stateId: string | undefined): string {
  if (stateId === undefined) return '';
  const map = t.symptomsByState as Record<string, string[]> | undefined;
  return (map?.[stateId] ?? []).join('|');
}

function casesExport(): void {
  const templates = readJson(join(DATA, 'case-templates.json')) as CaseTemplate[];
  const fsms = readJson(join(DATA, 'case-fsm.json')) as CaseFsmRow[];
  const rows: Row[] = templates.map((t) => {
    const fsm = fsms.find((row) => row.id === (t.fsmId as string | undefined));
    const demographics = t.demographics as Record<string, unknown> | undefined;
    const worse = fsm?.transitions?.find((tr) => tr.from === fsm.initial)?.to;
    return {
      case_id: t.id,
      wards: list(t.wards).join('|'),
      name: text(demographics?.name),
      age: String(num(demographics?.age)),
      sex: text(demographics?.sex),
      code: text(demographics?.code),
      complaint: text(t.presentingComplaint),
      diagnosis_id: list(t.diagnosisIds).join('|'),
      past_history: list(t.pastMedicalHistory).join('|'),
      known_diagnoses: list(t.knownDiagnoses).join('|'),
      allergies: list(t.allergies).join('|'),
      reversible_cause_ids: list(t.reversibleCauseIds).join('|'),
      complexity: text(t.complexity),
      initial_state: fsm?.initial ?? '',
      deteriorate_after_min: firstTimeInStateSec(fsm),
      arrest_rhythm: arrestRhythm(fsm),
      death_cause: text(t.deathCause),
      symptoms_initial: symptomsText(t, fsm?.initial),
      symptoms_deteriorating: symptomsText(t, worse),
    };
  });
  ensureDir();
  writeCsvFile(CASE_CSV, toCsv(CASE_COLUMNS, rows));
  console.log(`✅ ${CASE_CSV}：${String(rows.length)} 個現有病例（可照格式加行）`);
}

const DIAGNOSIS_IDS = [
  'pneumonia',
  'sepsis',
  'cellulitis',
  'uti',
  'copd',
  'hypertension',
  'heart-failure',
  'gi-bleed',
  'pe',
  'acs',
  'end-stage-malignancy',
] as const;

function casesImport(): void {
  if (!existsSync(CASE_CSV)) throw new Error(`找唔到 ${CASE_CSV}，先跑 cases:export`);
  const rows = parseTable(readFileSync(CASE_CSV, 'utf8'));
  const templatesPath = join(DATA, 'case-templates.json');
  const fsmPath = join(DATA, 'case-fsm.json');
  const trajPath = join(DATA, 'trajectories.json');
  const templates = readJson(templatesPath) as Record<string, unknown>[];
  const fsms = readJson(fsmPath) as Record<string, unknown>[];
  const trajectories = readJson(trajPath) as Record<string, unknown>[];
  const known = new Set(templates.map((row) => String(row.id)));
  const knownFsm = new Set(fsms.map((row) => String(row.id)));
  const knownTraj = new Set(trajectories.map((row) => String(row.id)));

  const added: string[] = [];
  const skipped: string[] = [];
  for (const row of rows) {
    const id = (row.case_id ?? '').trim();
    if (id === '' || known.has(id)) continue;
    const diagnosis = (row.diagnosis_id ?? '').split('|')[0] ?? '';
    if (!(DIAGNOSIS_IDS as readonly string[]).includes(diagnosis)) {
      skipped.push(`${id}（診斷 ${diagnosis || '空白'} 唔在名單）`);
      continue;
    }
    const wards = splitList(row.wards ?? 'MED');
    const trajInitial = `${id}-initial`;
    const trajWorse = `${id}-worse`;
    if (!knownTraj.has(trajInitial)) {
      // 借用同一診斷現有軌跡做骨架；冇就留空，等覆核時填。
      const borrowed = trajectories.find((t) => String(t.id).startsWith(`${diagnosis}-`));
      const shape = borrowed ? { ...borrowed } : { target: {}, consciousness: 'A' };
      trajectories.push({ ...shape, id: trajInitial });
      trajectories.push({ ...shape, id: trajWorse });
      knownTraj.add(trajInitial);
      knownTraj.add(trajWorse);
    }
    if (!knownFsm.has(id)) {
      const afterSec = Math.max(
        60,
        Math.round(Number(pick(row, 'deteriorate_after_min', '20')) * 60),
      );
      const worseState: Record<string, unknown> = { trajectory: trajWorse };
      const rhythm = pick(row, 'arrest_rhythm', '');
      if (rhythm !== '') worseState.arrest = { rhythm };
      fsms.push({
        id,
        initial: 'INITIAL',
        states: { INITIAL: { trajectory: trajInitial }, DETERIORATING: worseState },
        salvageable: true,
        transitions: [
          { from: 'INITIAL', to: 'DETERIORATING', when: { timeInStateSec: afterSec }, p: 1 },
        ],
      });
      knownFsm.add(id);
    }
    templates.push({
      id,
      fsmId: id,
      bed: 1,
      demographics: {
        name: pick(row, 'name', '未命名'),
        age: Number(pick(row, 'age', '70')),
        sex: pick(row, 'sex', 'M') === 'F' ? 'F' : 'M',
        code: pick(row, 'code', 'FULL') === 'DNR' ? 'DNR' : 'FULL',
      },
      presentingComplaint: pick(row, 'complaint', '待填').replace(/\|/gu, '、'),
      pastMedicalHistory: splitList(row.past_history),
      knownDiagnoses: splitList(row.known_diagnoses),
      complexity: pick(row, 'complexity', 'COMPLEX'),
      wards: wards.length > 0 ? wards : ['MED'],
      allergies: splitList(row.allergies),
      diagnosisIds: [diagnosis],
      diagnosisTerms: (() => {
        const terms = splitList(row.complaint);
        return terms.length > 0 ? terms : ['待填'];
      })(),
      symptomsByState: {
        INITIAL: splitList(row.symptoms_initial),
        DETERIORATING: splitList(row.symptoms_deteriorating),
      },
      reversibleCauseIds: splitList(row.reversible_cause_ids),
      deathCause: pick(row, 'death_cause', '心臟停頓（死因待確認）'),
    });
    known.add(id);
    added.push(id);
  }
  if (added.length === 0) {
    console.log('ℹ️ 冇新病例；沒有改動。');
  } else {
    writeJson(templatesPath, templates);
    writeJson(fsmPath, fsms);
    writeJson(trajPath, trajectories);
    console.log(`✅ 新增 ${String(added.length)} 個病例：${added.join('、')}`);
  }
  if (skipped.length > 0) {
    console.log(`⚠️ 跳過 ${String(skipped.length)} 行：\n  ${skipped.join('\n  ')}`);
  }
  console.log('👉 記得跑 npx prettier --write src/content/data 同 npm run content:validate');
}

const command = process.argv[2] ?? '';
const commands: Record<string, () => void> = {
  'drugs:export': drugsExport,
  'drugs:import': drugsImport,
  'cases:export': casesExport,
  'cases:import': casesImport,
};

const run = commands[command];
if (!run) {
  console.error(`用法：tsx scripts/content-kit.ts <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}
run();
