/** M7：回顧由 state 完整重建；每條記錄有出處，冇總分，只用 engine 事實。 */
import { describe, expect, it } from 'vitest';
import type { GameState } from '../core/state';
import { summariseRun } from '../score/grading';
import { feed, fullTables, intentEvent } from '../test/realEngine';
import { drive, kitEngine, kitParams, shiftAct } from '../shift/shiftKit';
import { buildReview } from './review';

const noEnergyTables = { 'rounds-topics': [] } as const;

function playedShift(seed: string): { state: GameState; engine: ReturnType<typeof kitEngine> } {
  const engine = kitEngine(noEnergyTables);
  let acted = false;
  const init = engine.init(kitParams(seed, 'DAY'));
  const midway = drive(engine, init, 3 * 3600, {
    step: 120,
    act(state) {
      if (acted) return [];
      acted = true;
      const [first] = Object.keys(state.patients);
      return first
        ? [
            intentEvent({ type: 'ENTER_BED', patientId: first }),
            intentEvent({ type: 'SUBMIT_CHAT', patientId: first, text: 'oxygen nrb' }),
          ]
        : [];
    },
  }).state;
  const overtime = drive(engine, midway, engine.config.shifts.day.regularSeconds, {
    step: 300,
  }).state;
  const handover = feed(engine, overtime, [shiftAct('BEGIN_HANDOVER')]).state;
  const done = feed(engine, handover, [shiftAct('HANDOVER_CONFIRM')]).state;
  return { state: done, engine };
}

describe('回顧重建', () => {
  const { state, engine } = playedShift('review-1');
  const review = buildReview(state, fullTables());

  it('整更跑完，有結局同記錄可供回顧', () => {
    expect(state.clock.phase).toBe('ENDED');
    expect(state.scoreLedger.length).toBeGreaterThan(0);
    expect(state.actionLog.length).toBeGreaterThan(0);
  });

  it('分項表：每條計分帳記錄出現剛好一次，並落喺自己嘅分項', () => {
    const ids = Object.values(review.table)
      .flat()
      .map((row) => row.id);
    expect(ids.sort()).toEqual(state.scoreLedger.map((e) => e.id).sort());
    for (const [subscore, rows] of Object.entries(review.table)) {
      for (const row of rows) expect(row.subscore).toBe(subscore);
    }
    expect(Object.keys(review.table).sort()).toEqual(
      review.summary.subscores.map((s) => s.id).sort(),
    );
  });

  it('時間線：涵蓋所有 action log、所有來電、所有計分記錄，並按時間排序', () => {
    const keys = new Set(review.timeline.map((item) => item.key));
    for (const log of state.actionLog) expect(keys.has(`log:${log.id}`), log.id).toBe(true);
    for (const call of state.ward.calls) expect(keys.has(`call:${call.id}`), call.id).toBe(true);
    for (const entry of state.scoreLedger)
      expect(keys.has(`score:${entry.id}`), entry.id).toBe(true);
    expect(review.timeline).toHaveLength(
      state.actionLog.length + state.ward.calls.length + state.scoreLedger.length,
    );
    const times = review.timeline.map((item) => item.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('每條計分記錄嘅分項同幅度都與 scoring-rules 一致（單一出處）', () => {
    const rules = fullTables()['scoring-rules'];
    for (const entry of state.scoreLedger) {
      const row = rules.find((r) => r.id === entry.rule);
      expect(row, entry.rule).toBeDefined();
      expect(entry.subscore, entry.rule).toBe(row?.subscore);
      expect(entry.delta, entry.rule).toBe(row?.delta);
    }
  });

  it('「如果早做 X」只列出有扣分、可比較嘅項目', () => {
    for (const item of review.whatIf) {
      const entry = state.scoreLedger.find((e) => e.id === item.id);
      expect(entry?.delta ?? 0).toBeLessThan(0);
    }
  });

  it('指引對照：每項都有準時／稍遲／未完成狀態、時限同「待核實」來源', () => {
    for (const item of review.guidelines) {
      expect(['ON_TIME', 'LATE', 'MISSED']).toContain(item.status);
      expect(item.windowSec).toBeGreaterThan(0);
      expect(item.guideline.source).toContain('待核實');
      expect(item.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');
    }
  });

  it('同一個 state 兩次建立回顧結果完全相同，亦唔改動 state', () => {
    const before = JSON.stringify(state);
    expect(buildReview(state, fullTables())).toEqual(review);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('評級摘要同回顧一致，冇總分', () => {
    expect(review.summary).toEqual(summariseRun(state, engine.tables));
    expect(Object.keys(review.summary)).not.toContain('total');
  });
});

describe('回顧：死亡同已盡力', () => {
  it('病人死亡有時間、有死亡流程狀態；已盡力只來自不可挽回病例', () => {
    const engine = kitEngine(noEnergyTables);
    const init = engine.init(kitParams('review-death', 'DAY'));
    const [first] = Object.keys(init.patients);
    const patientId = first ?? '';
    const state: GameState = {
      ...init,
      scoreLedger: [
        {
          id: 'sc1',
          t: 500,
          subscore: 'CLINICAL_OUTCOME',
          rule: 'PATIENT_DEATH',
          delta: -10,
          patientId,
          callId: null,
          evidenceRef: `death:${patientId}`,
          facts: {},
        },
      ],
    };
    const review = buildReview(state, fullTables());
    expect(review.deaths).toHaveLength(1);
    expect(review.deaths[0]?.patientId).toBe(patientId);
    expect(review.deaths[0]?.doneBest).toBe(!review.deaths[0]?.salvageable);
    expect(review.summary.doneBest).toBe(review.deaths[0]?.doneBest);
  });
});
