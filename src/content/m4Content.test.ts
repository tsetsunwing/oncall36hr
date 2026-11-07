/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- 測試用的欄位變異（刻意製造壞資料） */
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

describe('M4 content 表（T12／T13／T15–T18／T24／T28）', () => {
  const { tables } = getContent();
  const config = getConfig();

  it('shipped content 有效；M4 臨床／平衡數值全部標為待審核', () => {
    expect(validateContent(clone(rawContent)).ok).toBe(true);
    for (const name of [
      'difficulty-profiles',
      'rank-complexity',
      'delegation-results',
      'rank-behaviour',
      'scoring-rules',
      'consult-departments',
    ] as const) {
      for (const row of tables[name]) {
        expect((row as { reviewStatus: string }).reviewStatus, `${name}:${row.id}`).toBe(
          'PENDING_CLINICAL_REVIEW',
        );
      }
    }
  });

  it('config 與表一致：T12 來電加成、可靠度與速度倍率涵蓋全部難度與資歷', () => {
    for (const profile of tables['difficulty-profiles']) {
      expect(config.difficulty.phoneVolumeUplift[profile.id], profile.id).toBeDefined();
      expect(config.staff.nurseSeniorityByDifficulty[profile.id], profile.id).toBeDefined();
    }
    expect(config.difficulty.phoneVolumeUplift).toEqual({ EASY: 0, MEDIUM: 0.1, HARD: 0.2 });
    for (const level of ['NOVICE', 'NORMAL', 'SENIOR'] as const) {
      expect(config.staff.reliability[level]).toBeGreaterThan(0);
      expect(config.staff.speedMultiplier[level]).toBeGreaterThan(0);
    }
    expect(config.staff.reliability).toEqual({ NOVICE: 0.7, NORMAL: 0.85, SENIOR: 0.95 });
    expect(config.staff.speedMultiplier).toEqual({ NOVICE: 1.5, NORMAL: 1, SENIOR: 0.8 });
    expect(config.ward.bedCount).toBe(tables['ward-layout'].filter((r) => r.kind === 'BED').length);
    for (const profile of tables['difficulty-profiles']) {
      expect(profile.occupancy.max).toBeLessThanOrEqual(config.ward.bedCount);
    }
  });

  it('下屬能力 level 只存在於 subordinates 表，不會出現在 tone 文字', () => {
    for (const sub of tables.subordinates) {
      expect(sub.tone).not.toMatch(/新手|資深|熟手|能力|NOVICE|SENIOR|NORMAL/);
    }
  });

  it('壞資料會被交叉引用攔下', () => {
    expect(
      messages(
        mutate('call-templates', (rows) => {
          const row = rows.find((r) => r.kind === 'CALL');
          if (row) row.responses.GO_NOW.events = ['NO_SUCH_RULE'];
        }),
      ),
    ).toContain('未知 scoring-rules');
    expect(
      messages(
        mutate('delegation-results', (rows) => {
          const item = rows[0]?.items[0];
          if (item) item.catalogId = 'no.such.order';
        }),
      ),
    ).toContain('未知 order-catalog');
    expect(
      messages(
        mutate('ward-layout', (rows) => {
          const bed = rows.filter((r) => r.kind === 'BED')[1];
          if (bed) bed.bed = 1;
        }),
      ),
    ).toContain('床號重複');
    expect(messages(mutate('subordinates', (rows) => rows.splice(0, 1)))).toContain('缺少');
    expect(messages(mutate('nurse-roster', (rows) => rows.splice(0, 1)))).toContain('沒有護士');
  });
});
