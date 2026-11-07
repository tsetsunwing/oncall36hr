/** T-F 內容驗證：交叉引用檢查（implementation-plan §15）。只讀 data，唔含遊戲邏輯。 */
import type { ContentIssue } from './schema/issues';
import { CONCERN_CATEGORIES } from './schema/m3Tables';
import type { Tables } from './schema/tables';

const RESULT_TYPES: readonly string[] = [
  'LAB_BLOOD',
  'ECG',
  'XRAY',
  'CT',
  'ULTRASOUND',
  'ABG',
  'BLOOD_CULTURE',
  'CROSSMATCH',
];
const RESULT_TOKEN = /^(vital|rhythm|mews|patient)\./;

export function validateCrossReferences(tables: Tables): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (table: string, path: string, message: string) => {
    issues.push({ table, path, message });
  };
  const ids = (rows: readonly { id: string }[]) => new Set(rows.map((r) => r.id));

  const trajectoryIds = ids(tables.trajectories);
  const rhythmIds = ids(tables.rhythms);
  const catalogIds = ids(tables['order-catalog']);
  const formularyIds = ids(tables.formulary);
  const allFsmStates = new Set(tables['case-fsm'].flatMap((f) => Object.keys(f.states)));
  const fsmById = new Map(tables['case-fsm'].map((f) => [f.id, f]));

  tables.trajectories.forEach((t, i) => {
    if (!rhythmIds.has(t.rhythm))
      add('trajectories', `${String(i)}.rhythm`, `未知 rhythm：${t.rhythm}`);
  });

  tables['case-fsm'].forEach((fsm, i) => {
    if (!(fsm.initial in fsm.states)) {
      add('case-fsm', `${String(i)}.initial`, `初始狀態 ${fsm.initial} 不在 states 內`);
    }
    for (const [state, def] of Object.entries(fsm.states)) {
      if (!trajectoryIds.has(def.trajectory)) {
        add('case-fsm', `${String(i)}.states.${state}`, `未知 trajectory：${def.trajectory}`);
      }
    }
    fsm.transitions.forEach((tr, j) => {
      for (const end of [tr.from, tr.to]) {
        if (!(end in fsm.states)) {
          add('case-fsm', `${String(i)}.transitions.${String(j)}`, `轉移引用未知狀態：${end}`);
        }
      }
    });
  });

  tables['case-templates'].forEach((tpl, i) => {
    const fsm = fsmById.get(tpl.fsmId);
    if (!fsm) {
      add('case-templates', `${String(i)}.fsmId`, `未知 case-fsm：${tpl.fsmId}`);
      return;
    }
    for (const state of Object.keys(tpl.symptomsByState)) {
      if (!(state in fsm.states)) {
        add('case-templates', `${String(i)}.symptomsByState.${state}`, `未知 FSM 狀態：${state}`);
      }
    }
  });

  const resultIds = ids(tables.results);
  tables['order-catalog'].forEach((entry, i) => {
    const at = String(i);
    if (entry.formularyId && !formularyIds.has(entry.formularyId)) {
      add('order-catalog', `${at}.formularyId`, `未知 formulary：${entry.formularyId}`);
    }
    if (entry.resultId && !resultIds.has(entry.resultId)) {
      add('order-catalog', `${at}.resultId`, `未知 results：${entry.resultId}`);
    }
    if (RESULT_TYPES.includes(entry.type) && !entry.resultId) {
      add('order-catalog', `${at}.resultId`, `${entry.type} 類 order 必須有 resultId`);
    }
    if (entry.type === 'DRUG' && (!entry.formularyId || !entry.pharmacyGate)) {
      add('order-catalog', at, 'DRUG 必須有 formularyId 而且 pharmacyGate 為 true（藥房永遠把關）');
    }
    if (entry.pharmacyGate && entry.type !== 'DRUG') {
      add('order-catalog', `${at}.pharmacyGate`, '只有 DRUG 先經藥房把關');
    }
  });

  tables.results.forEach((result, i) => {
    for (const [j, item] of result.items.entries()) {
      for (const state of Object.keys(item.byState)) {
        if (state !== '*' && !allFsmStates.has(state)) {
          add('results', `${String(i)}.items.${String(j)}.byState`, `未知 FSM 狀態：${state}`);
        }
      }
      if (!('*' in item.byState) && [...allFsmStates].some((s) => !(s in item.byState))) {
        add(
          'results',
          `${String(i)}.items.${String(j)}.byState`,
          '必須涵蓋所有 FSM 狀態或提供 "*"',
        );
      }
    }
    for (const [state, entry] of Object.entries(result.textByState)) {
      if (state !== '*' && !allFsmStates.has(state)) {
        add('results', `${String(i)}.textByState`, `未知 FSM 狀態：${state}`);
      }
      for (const token of entry.text.matchAll(/\{\{([^}]*)\}\}/g)) {
        if (!RESULT_TOKEN.test(token[1] ?? '')) {
          add('results', `${String(i)}.textByState.${state}`, `未授權 token：${token[1] ?? ''}`);
        }
      }
    }
  });

  const seenCategories = new Set(tables.consequences.map((c) => c.category));
  tables.consequences.forEach((row, i) => {
    if (row.id !== row.category) {
      add('consequences', `${String(i)}.id`, `id 必須等於 category（${row.category}）`);
    }
  });
  for (const category of tables.consequences.length > 0 ? CONCERN_CATEGORIES : []) {
    if (!seenCategories.has(category)) {
      add('consequences', '(根)', `缺少 category：${category}`);
    }
  }

  tables.formulary.forEach((entry, i) => {
    if (!catalogIds.has(entry.catalogId)) {
      add('formulary', `${String(i)}.catalogId`, `未知 order-catalog：${entry.catalogId}`);
    }
  });

  tables['order-effects'].forEach((fx, i) => {
    if (!catalogIds.has(fx.catalogId)) {
      add('order-effects', `${String(i)}.catalogId`, `未知 order-catalog：${fx.catalogId}`);
    }
    for (const state of fx.states) {
      if (state !== '*' && !allFsmStates.has(state)) {
        add('order-effects', `${String(i)}.states`, `未知 FSM 狀態：${state}`);
      }
    }
  });

  tables['quick-words'].forEach((word, i) => {
    if (!catalogIds.has(word.catalogId)) {
      add('quick-words', `${String(i)}.catalogId`, `未知 order-catalog：${word.catalogId}`);
    }
    const executor = word.params?.executor;
    const catalog = tables['order-catalog'].find((r) => r.id === word.catalogId);
    if (executor && catalog && !catalog.executors.includes(executor)) {
      add(
        'quick-words',
        `${String(i)}.params.executor`,
        `${word.catalogId} 唔允許執行者 ${executor}`,
      );
    }
    const drugId = word.params?.drugFormularyId;
    if (drugId && !formularyIds.has(drugId)) {
      add('quick-words', `${String(i)}.params.drugFormularyId`, `未知 formulary：${drugId}`);
    }
  });

  tables.mews.forEach((mews, i) => {
    const sorted = [...mews.bands].sort((a, b) => a.min - b.min);
    let expected = 0;
    sorted.forEach((band, j) => {
      if (band.min !== expected) {
        add('mews', `${String(i)}.bands`, `band 必須由 0 起連續覆蓋，缺口喺 ${String(expected)}`);
      }
      if (band.max === null && j !== sorted.length - 1) {
        add('mews', `${String(i)}.bands`, '只有最後一個 band 可以無上限');
      }
      expected = band.max === null ? Number.POSITIVE_INFINITY : band.max + 1;
    });
    if (expected !== Number.POSITIVE_INFINITY) {
      add('mews', `${String(i)}.bands`, '最後一個 band 必須無上限（max: null）');
    }
    for (const [key, ranges] of Object.entries(mews.components)) {
      if (ranges[0]?.min !== null || ranges[ranges.length - 1]?.max !== null) {
        add('mews', `${String(i)}.components.${key}`, '區間必須由無下限起、至無上限止');
      }
      for (let k = 1; k < ranges.length; k++) {
        if (ranges[k]?.min !== ranges[k - 1]?.max) {
          add('mews', `${String(i)}.components.${key}`, `區間唔連續（第 ${String(k)} 段）`);
        }
      }
    }
  });

  validateWardRefs(tables, add);

  return issues;
}

const REQUIRED_RULES: readonly string[] = [
  'ESCALATION_SKIPPED_LEVEL',
  'ESCALATION_STEP_OK',
  'SBAR_GOOD',
  'SBAR_POOR',
  'CONSULT_GOOD',
  'CONSULT_POOR',
  'DELEGATION_FAILED',
  'CALL_DELEGATED_OK',
];

function validateWardRefs(
  tables: Tables,
  add: (table: string, path: string, message: string) => void,
) {
  const ruleIds = new Set(tables['scoring-rules'].map((r) => r.id));
  const catalog = new Map(tables['order-catalog'].map((r) => [r.id, r]));
  const deptIds = new Set(tables['consult-departments'].map((r) => r.id));

  for (const rule of tables['scoring-rules'].length > 0 ? REQUIRED_RULES : []) {
    if (!ruleIds.has(rule)) add('scoring-rules', rule, `缺少 M4 必需規則：${rule}`);
  }

  tables['call-templates'].forEach((row, i) => {
    if (row.kind !== 'CALL') return;
    for (const [response, effect] of Object.entries(row.responses)) {
      for (const event of effect.events) {
        if (!ruleIds.has(event)) {
          add(
            'call-templates',
            `${String(i)}.responses.${response}`,
            `未知 scoring-rules：${event}`,
          );
        }
      }
    }
    for (const dept of row.deptPool ?? []) {
      if (!deptIds.has(dept)) {
        add('call-templates', `${String(i)}.deptPool`, `未知 consult-departments：${dept}`);
      }
    }
  });
  const prefills = tables['call-templates'].filter((r) => r.kind === 'SBAR_PREFILL');
  if (tables['call-templates'].length > 0 && prefills.length !== 1) {
    add(
      'call-templates',
      'SBAR_PREFILL',
      `必須剛好一個 SBAR_PREFILL 模板（現有 ${String(prefills.length)}）`,
    );
  }

  tables['delegation-results'].forEach((row, i) => {
    row.items.forEach((item, j) => {
      if (item.catalogId === undefined) return;
      const entry = catalog.get(item.catalogId);
      if (!entry) {
        add(
          'delegation-results',
          `${String(i)}.items.${String(j)}`,
          `未知 order-catalog：${item.catalogId}`,
        );
      } else if (!entry.executors.includes('SUBORDINATE')) {
        add(
          'delegation-results',
          `${String(i)}.items.${String(j)}`,
          `${item.catalogId} 不允許下屬執行`,
        );
      }
    });
  });

  const beds = tables['ward-layout'].filter((r) => r.kind === 'BED');
  const bedNumbers = new Set(beds.map((b) => b.bed));
  if (bedNumbers.size !== beds.length) add('ward-layout', 'bed', '床號重複');
  for (let n = 1; n <= beds.length; n++) {
    if (!bedNumbers.has(n)) add('ward-layout', 'bed', `床號必須由 1 起連續，缺 ${String(n)}`);
  }
  const cells = new Set(beds.map((b) => `${String(b.row)},${String(b.col)}`));
  if (cells.size !== beds.length) add('ward-layout', 'row,col', '兩張床佔用同一格');
  const zones = new Set(beds.map((b) => b.zone));
  for (const nurse of tables['nurse-roster']) {
    if (!zones.has(nurse.zone)) add('nurse-roster', nurse.id, `護士分區 ${nurse.zone} 沒有床位`);
  }
  for (const zone of tables['nurse-roster'].length > 0 ? zones : []) {
    for (const shift of ['DAY', 'NIGHT'] as const) {
      if (!tables['nurse-roster'].some((n) => n.zone === zone && n.shift === shift)) {
        add('nurse-roster', `${zone}.${shift}`, `分區 ${zone} 的 ${shift} 班沒有護士`);
      }
    }
  }
  if (beds.length > 0 && !tables['ward-layout'].some((r) => r.kind === 'WALK')) {
    add('ward-layout', 'WALK', '缺少行走時間');
  }

  for (const rank of tables.subordinates.length > 0 ? (['HO', 'MO'] as const) : []) {
    for (const level of ['NOVICE', 'NORMAL', 'SENIOR'] as const) {
      if (!tables.subordinates.some((r) => r.rank === rank && r.level === level)) {
        add('subordinates', `${rank}.${level}`, `缺少 ${rank} 的 ${level} 下屬`);
      }
    }
  }
}
