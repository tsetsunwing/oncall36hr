/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- 測試用的欄位變異（刻意製造壞資料） */
import { describe, expect, it } from 'vitest';
import { getConfig, getContent, rawContent, validateContent } from '.';

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

const { tables } = getContent();
const config = getConfig();

describe('M4b content（T27、ARREST_ALERT、DEATH_SBAR、config.consult／family）', () => {
  it('shipped content 有效；T27 臨床／溝通內容標為待審核', () => {
    expect(validateContent(clone(rawContent)).ok).toBe(true);
    for (const row of tables['family-scenarios']) {
      expect(row.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');
    }
  });

  it('SBAR 清單：每段至少一項可令該段算齊；追問次序只用清單內項目', () => {
    const { items, partAnyOf, askOrder } = config.consult;
    const partOf = new Map(items.map((i) => [i.id, i.part] as const));
    for (const part of ['S', 'B', 'A', 'R'] as const) {
      expect(partAnyOf[part].length).toBeGreaterThan(0);
      for (const id of partAnyOf[part]) expect(partOf.get(id)).toBe(part);
    }
    for (const id of askOrder) expect(partOf.has(id)).toBe(true);
  });

  it('T27：六種（已知悉×同理心）反應齊全；四個開場選項；每個選項都有訊號', () => {
    const scenario = tables['family-scenarios'][0];
    expect(scenario?.stages.OPENING).toHaveLength(4);
    expect(scenario?.reactions).toHaveLength(6);
    for (const option of [
      ...(scenario?.stages.OPENING ?? []),
      ...(scenario?.stages.FOLLOWUP ?? []),
    ]) {
      expect(option.signals.length).toBeGreaterThan(0);
      expect(option.line).not.toMatch(/\d/);
    }
  });

  it('ARREST_ALERT／DEATH_SBAR 各自剛好一個，ARREST_ALERT 回應只用已存在嘅計分規則', () => {
    const rows = tables['call-templates'];
    expect(rows.filter((r) => r.kind === 'ARREST_ALERT')).toHaveLength(1);
    expect(rows.filter((r) => r.kind === 'DEATH_SBAR')).toHaveLength(1);
  });

  it('壞資料被攔：缺 ARREST_ALERT、未知回應規則、T27 缺反應或指向未知規則', () => {
    expect(
      messages(
        mutate('call-templates', (rows) => {
          rows.splice(
            rows.findIndex((r) => r.kind === 'ARREST_ALERT'),
            1,
          );
        }),
      ),
    ).toContain('ARREST_ALERT');
    expect(
      messages(
        mutate('call-templates', (rows) => {
          rows.find((r) => r.kind === 'ARREST_ALERT')!.responses.GO_NOW.events = ['NO_SUCH_RULE'];
        }),
      ),
    ).toContain('未知 scoring-rules');
    expect(
      messages(
        mutate('family-scenarios', (rows) => {
          const row: { reactions: unknown[] } = rows[0] as never;
          row.reactions.splice(0, 1);
        }),
      ),
    ).toContain('必須剛好一行');
    expect(
      messages(
        mutate('family-scenarios', (rows) => {
          (rows[0] as any).scoring.empathy[0] = 'NO_SUCH_RULE';
        }),
      ),
    ).toContain('未知 scoring-rules');
    expect(
      messages(
        mutate('scoring-rules', (rows) => {
          rows.splice(
            rows.findIndex((r) => r.id === 'SBAR_INACCURATE'),
            1,
          );
        }),
      ),
    ).toContain('SBAR_INACCURATE');
  });
});
