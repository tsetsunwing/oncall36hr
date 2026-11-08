/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- 測試用嘅欄位變異（刻意製造壞資料），唔值得為每個欄位寫型別 */
import { describe, expect, it } from 'vitest';
import { getContent, rawContent, validateContent } from '.';

type Rows = Record<string, any>[];
const clone = <T>(value: T): T => structuredClone(value);

function mutate(table: string, change: (rows: Rows) => void) {
  const raw = clone(rawContent);
  change(raw.tables[table] as Rows);
  return validateContent(raw);
}

function messages(result: ReturnType<typeof validateContent>): string {
  return result.ok ? '' : result.issues.map((i) => `${i.table}:${i.message}`).join('\n');
}

describe('M3 content 表（T4／T5／T6／T7／T11）', () => {
  const { tables } = getContent();

  it('shipped content 有效；所有臨床數值待審核旗標一致（唔假扮正式值）', () => {
    expect(validateContent(clone(rawContent)).ok).toBe(true);
    for (const name of [
      'order-catalog',
      'formulary',
      'order-effects',
      'results',
      'consequences',
    ] as const) {
      for (const row of tables[name]) {
        expect((row as { reviewStatus: string }).reviewStatus, `${name}:${row.id}`).toBe(
          'PENDING_CLINICAL_REVIEW',
        );
      }
    }
  });

  it('formulary 嘅常用劑量（typicalDose）冇擅自填數字：全部 null', () => {
    for (const drug of tables.formulary) expect(drug.typicalDose, drug.id).toBeNull();
  });

  it('T11 七個關注類別齊全，LOW 一律 REVIEW_ONLY，p 喺 [0,1]，MID／HIGH 有效果', () => {
    expect(tables.consequences.map((c) => c.id).sort()).toEqual([
      'ALLERGY',
      'CONTRAINDICATION',
      'DOSE_HIGH',
      'DOSE_LOW',
      'INTERACTION',
      'OTHER',
      'WRONG_ROUTE',
    ]);
    for (const row of tables.consequences) {
      expect(row.levels.LOW.mode).toBe('REVIEW_ONLY');
      for (const level of Object.values(row.levels)) {
        expect(level.p).toBeGreaterThanOrEqual(0);
        expect(level.p).toBeLessThanOrEqual(1);
      }
      expect(row.levels.MID.effect).not.toBeNull();
      expect(row.levels.HIGH.effect).not.toBeNull();
    }
  });

  it('result-type order 需要 resultId，resultId 必須存在', () => {
    const missing = mutate('order-catalog', (rows) => {
      const lab = rows.find((r) => r.id === 'lab.cbc');
      if (lab) delete lab.resultId;
    });
    expect(messages(missing)).toContain('resultId');
    const unknown = mutate('order-catalog', (rows) => {
      const lab = rows.find((r) => r.id === 'lab.cbc');
      if (lab) lab.resultId = 'res.nope';
    });
    expect(messages(unknown)).toContain('res.nope');
  });

  it('藥物必須有 pharmacyGate（藥房一律把關）；非藥物唔可以有', () => {
    const drug = mutate('order-catalog', (rows) => {
      const row = rows.find((r) => r.id === 'drug.ceftriaxone');
      if (row) row.pharmacyGate = false;
    });
    expect(messages(drug)).toContain('pharmacyGate');
    const other = mutate('order-catalog', (rows) => {
      const row = rows.find((r) => r.id === 'lab.cbc');
      if (row) row.pharmacyGate = true;
    });
    expect(messages(other)).toContain('只有 DRUG');
  });

  it('result byState 必須覆蓋 FSM 全部狀態或有 "*"；result token 只可用 vital／rhythm／mews／patient', () => {
    const uncovered = mutate('results', (rows) => {
      const panel = rows.find((r) => r.id === 'res.cbc');
      const item = panel?.items?.[0];
      if (item) item.byState = { NOT_A_STATE: 1 };
    });
    expect(messages(uncovered)).toContain('未知 FSM 狀態');
    const token = mutate('results', (rows) => {
      const report = rows.find((r) => r.id === 'res.cxr');
      if (report) report.textByState = { '*': { text: '見 {{state.fsm}}', abnormal: false } };
    });
    expect(messages(token)).toContain('未授權 token');
  });

  it('consequence：REVIEW_ONLY 唔可以有 effect；IMMEDIATE 必須有 effect；只有 DELAYED 可有 delay', () => {
    const reviewWithEffect = mutate('consequences', (rows) => {
      const row = rows[0];
      if (row)
        row.levels.LOW.effect = {
          delta: { hr: 1 },
          delaySec: 0,
          rampSec: 1,
          durationSec: null,
          setsFlags: [],
        };
    });
    expect(reviewWithEffect.ok).toBe(false);
    const immediateWithoutEffect = mutate('consequences', (rows) => {
      const row = rows[0];
      if (row) row.levels.HIGH.effect = null;
    });
    expect(immediateWithoutEffect.ok).toBe(false);
    const delayOnImmediate = mutate('consequences', (rows) => {
      const row = rows[0];
      if (row) row.levels.HIGH.delayMinSec = 5;
    });
    expect(delayOnImmediate.ok).toBe(false);
  });

  it('consequence 缺少類別、id 同 category 唔一致都會被拒絕', () => {
    expect(
      messages(
        mutate('consequences', (rows) => {
          rows.pop();
        }),
      ),
    ).toContain('缺少 category');
    expect(
      messages(
        mutate('consequences', (rows) => {
          const row = rows[0];
          if (row) row.id = 'SOMETHING';
        }),
      ),
    ).toContain('id 必須等於 category');
  });

  it('快捷詞 executor 必須係 catalog 允許嘅執行者', () => {
    const result = mutate('quick-words', (rows) => {
      const row = rows.find((r) => r.id === 'qw.ng.sub');
      const catalog = (rawContent.tables['order-catalog'] as Rows).find(
        (r) => r.id === row?.catalogId,
      );
      if (row && catalog) {
        row.catalogId = 'obs.vitals';
      }
    });
    expect(messages(result)).toContain('唔允許執行者');
  });

  it('config gate／staff 設定存在且合理', () => {
    const { config } = getContent();
    expect(config.gate.pharmacyName.length).toBeGreaterThan(0);
    expect(config.gate.insistRequired.OBJECT).toBeGreaterThanOrEqual(
      config.gate.insistRequired.CONFIRM,
    );
    expect(config.staff.nurseSeniorityByDifficulty.HARD).toBe('NEW');
  });
});
