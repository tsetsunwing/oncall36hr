/** T-F 內容驗證：交叉引用檢查（implementation-plan §15）。只讀 data，唔含遊戲邏輯。 */
import type { ContentIssue } from './schema/issues';
import type { Tables } from './schema/tables';

export function validateCrossReferences(tables: Tables): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (table: string, path: string, message: string) => {
    issues.push({ table, path, message });
  };
  const ids = <T extends { id: string }>(rows: readonly T[]) => new Set(rows.map((r) => r.id));

  const trajectoryIds = ids(tables.trajectories);
  const rhythmIds = ids(tables.rhythms);
  const catalogIds = ids(tables['order-catalog']);
  const formularyIds = ids(tables.formulary);
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

  tables['order-catalog'].forEach((entry, i) => {
    if (entry.formularyId && !formularyIds.has(entry.formularyId)) {
      add('order-catalog', `${String(i)}.formularyId`, `未知 formulary：${entry.formularyId}`);
    }
  });

  tables.formulary.forEach((entry, i) => {
    if (!catalogIds.has(entry.catalogId)) {
      add('formulary', `${String(i)}.catalogId`, `未知 order-catalog：${entry.catalogId}`);
    }
  });

  const allStates = new Set(tables['case-fsm'].flatMap((f) => Object.keys(f.states)));
  tables['order-effects'].forEach((fx, i) => {
    if (!catalogIds.has(fx.catalogId)) {
      add('order-effects', `${String(i)}.catalogId`, `未知 order-catalog：${fx.catalogId}`);
    }
    for (const state of fx.states) {
      if (state !== '*' && !allStates.has(state)) {
        add('order-effects', `${String(i)}.states`, `未知 FSM 狀態：${state}`);
      }
    }
  });

  tables['quick-words'].forEach((word, i) => {
    if (!catalogIds.has(word.catalogId)) {
      add('quick-words', `${String(i)}.catalogId`, `未知 order-catalog：${word.catalogId}`);
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

  return issues;
}
