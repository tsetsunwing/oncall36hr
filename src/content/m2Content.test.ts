import { describe, expect, it } from 'vitest';
import { getContent, rawContent, validateContent } from '.';

type Rows = Record<string, unknown>[];
const clone = <T>(value: T): T => structuredClone(value);

function mutate(table: string, change: (rows: Rows) => void) {
  const raw = clone(rawContent);
  change(raw.tables[table] as Rows);
  return validateContent(raw);
}

function messages(result: ReturnType<typeof validateContent>): string {
  return result.ok ? '' : result.issues.map((i) => `${i.table}:${i.message}`).join('\n');
}

describe('M2 content 表：schema 同交叉引用', () => {
  it('shipped content 完全有效', () => {
    expect(validateContent(clone(rawContent)).ok).toBe(true);
  });

  it('MEWS 表標明待臨床核對（placeholder 不可假裝係正式值）', () => {
    expect(getContent().tables.mews[0]?.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');
  });

  it('trajectory 引用未知 rhythm', () => {
    const result = mutate('trajectories', (rows) => {
      if (rows[0]) rows[0].rhythm = 'NOPE';
    });
    expect(messages(result)).toContain('未知 rhythm');
  });

  it('FSM 引用未知 trajectory／未知狀態／初始狀態不存在', () => {
    const result = mutate('case-fsm', (rows) => {
      const fsm = rows[0] as {
        initial: string;
        states: Record<string, { trajectory: string }>;
        transitions: { to: string }[];
      };
      fsm.initial = 'NOWHERE';
      const first = Object.values(fsm.states)[0];
      if (first) first.trajectory = 'nope';
      if (fsm.transitions[0]) fsm.transitions[0].to = 'GHOST';
    });
    const text = messages(result);
    expect(text).toContain('初始狀態');
    expect(text).toContain('未知 trajectory');
    expect(text).toContain('未知狀態');
  });

  it('order-effects／quick-words／formulary 引用未知 catalog', () => {
    for (const table of ['order-effects', 'quick-words', 'formulary']) {
      const result = mutate(table, (rows) => {
        if (rows[0]) rows[0].catalogId = 'missing.catalog';
      });
      expect(messages(result), table).toContain('未知 order-catalog');
    }
  });

  it('order-effects 引用未知 FSM 狀態', () => {
    const result = mutate('order-effects', (rows) => {
      if (rows[0]) rows[0].states = ['MARS'];
    });
    expect(messages(result)).toContain('未知 FSM 狀態');
  });

  it('MEWS 區間有缺口／band 唔連續都會被攔住', () => {
    const gap = mutate('mews', (rows) => {
      const mews = rows[0] as { components: { hr: { min: number | null }[] } };
      const hr = mews.components.hr[2];
      if (hr) hr.min = 55;
    });
    expect(messages(gap)).toContain('區間唔連續');

    const bands = mutate('mews', (rows) => {
      const mews = rows[0] as { bands: { min: number }[] };
      if (mews.bands[1]) mews.bands[1].min = 5;
    });
    expect(messages(bands)).toContain('band');
  });

  it('case template 嘅 symptomsByState 只可以用 FSM 狀態', () => {
    const result = mutate('case-templates', (rows) => {
      const tpl = rows[0] as { symptomsByState: Record<string, string[]> };
      tpl.symptomsByState.UNKNOWN = ['x'];
    });
    expect(messages(result)).toContain('未知 FSM 狀態');
  });

  it('每個 diagnosis deny 詞都唔會出現喺病人可見資料（主訴、症狀）', () => {
    const template = getContent().tables['case-templates'][0];
    const visible = [
      template?.presentingComplaint ?? '',
      ...Object.values(template?.symptomsByState ?? {}).flat(),
    ]
      .join(' ')
      .toLowerCase();
    for (const term of template?.diagnosisTerms ?? []) {
      expect(visible).not.toContain(term.toLowerCase());
    }
  });
});
