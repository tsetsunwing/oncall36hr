/** M7：把關計分（安全分項）同 AI 評語嘅文字守衛；回顧只顯示經守衛、由 engine 凍結值組成嘅句子。 */
import { describe, expect, it } from 'vitest';
import type { EngineTables } from '../case/tables';
import type { JsonValue } from '../core/eventQueue';
import type { GameState } from '../core/state';
import { buildReview } from '../review/review';
import {
  aiRequests,
  feed,
  intentEvent,
  params,
  realEngine,
  realTables,
  say,
  zeroNoiseTables,
} from '../test/realEngine';

const base = zeroNoiseTables();
const CONCERN = {
  category: 'ALLERGY',
  line: '病人對 {{patient.allergies}} 過敏，{{order.label}} 有交叉風險。',
};

function withConsequence(p: number, level: 'LOW' | 'MID' | 'HIGH'): EngineTables {
  const hit = {
    p,
    mode: 'IMMEDIATE' as const,
    effect: {
      delta: { hr: 20 },
      delaySec: 0,
      rampSec: 60,
      durationSec: null,
      setsFlags: ['adverse.test'],
    },
  };
  const miss = { p: 0, mode: 'REVIEW_ONLY' as const, effect: null };
  return {
    ...base,
    consequences: base.consequences.map((row) => ({
      ...row,
      levels: {
        LOW: level === 'LOW' ? hit : miss,
        MID: level === 'MID' ? hit : miss,
        HIGH: level === 'HIGH' ? hit : miss,
      },
    })),
  };
}

function toDecision(
  tables: EngineTables,
  seed: string,
  safety: { score: number; rationale: string },
) {
  const engine = realEngine(tables);
  const placed = feed(engine, engine.init(params(seed)), [say('augmentin 1.2 g iv')]);
  const answer = (kind: string, payload: JsonValue, state: GameState) =>
    feed(
      engine,
      state,
      aiRequests(placed.effects)
        .filter((r) => r.kind === kind)
        .map((r) => ({ type: 'AI_RESULT' as const, reqId: r.reqId, payload })),
    );
  const pharmacy = answer(
    'gate.pharmacy',
    { verdict: 'OBJECT', concerns: [CONCERN], safety },
    placed.state,
  );
  const nurse = answer('gate.nurse', { verdict: 'CONFIRM', concerns: [CONCERN] }, pharmacy.state);
  return { engine, state: nurse.state, id: Object.values(nurse.state.orders)[0]?.id ?? '' };
}

function insistTwiceAndRate(
  ctx: ReturnType<typeof toDecision>,
  danger: 'LOW' | 'MID' | 'HIGH',
  rationale = '風險按引擎事實評估。',
) {
  const insisted = feed(ctx.engine, ctx.state, [
    intentEvent({ type: 'INSIST_ORDER', orderId: ctx.id }),
    intentEvent({ type: 'INSIST_ORDER', orderId: ctx.id }),
  ]);
  const request = aiRequests(insisted.effects).find((r) => r.kind === 'gate.danger');
  return feed(ctx.engine, insisted.state, [
    {
      type: 'AI_RESULT',
      reqId: request?.reqId ?? '',
      payload: { danger, category: 'ALLERGY', rationale },
    },
  ]).state;
}

const rules = (state: GameState) => state.scoreLedger.map((e) => e.rule);
const GOOD_SAFETY = { score: 9, rationale: '已核對 {{patient.allergies}}。' };

describe('把關計分：全部落「安全」分項', () => {
  it('聽取關注而取消：+「聽取關注」，唔記堅持、唔記藥房安全評分', () => {
    const ctx = toDecision(base, 'gs-cancel', GOOD_SAFETY);
    const done = feed(ctx.engine, ctx.state, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: ctx.id }),
    ]).state;
    expect(rules(done)).toEqual(['GATE_OBJECTION_HEEDED']);
    expect(done.scoreLedger[0]?.subscore).toBe('SAFETY');
    expect(done.scoreLedger[0]?.evidenceRef).toBe(`gate:${ctx.id}`);
  });

  it('在對方反對下堅持下單：記「堅持（反對）」；藥房安全評分只喺放行時入帳', () => {
    const ctx = toDecision(base, 'gs-insist', GOOD_SAFETY);
    expect(rules(ctx.state)).toEqual([]);
    const done = insistTwiceAndRate(ctx, 'LOW');
    expect(rules(done)).toContain('GATE_INSISTED_OBJECT');
    expect(rules(done)).toContain('PHARMACY_SAFETY_GOOD');
    const gateEntries = done.scoreLedger.filter((e) => e.evidenceRef === `gate:${ctx.id}`);
    expect(gateEntries.length).toBeGreaterThanOrEqual(2);
    expect(gateEntries.every((e) => e.subscore === 'SAFETY')).toBe(true);
  });

  it.each([
    [9, 'PHARMACY_SAFETY_GOOD'],
    [6, 'PHARMACY_SAFETY_FAIR'],
    [2, 'PHARMACY_SAFETY_POOR'],
  ])('藥房 AI 安全評分 %i → %s（門檻來自 scoring-model）', (score, rule) => {
    const ctx = toDecision(base, `gs-score-${String(score)}`, { score, rationale: '' });
    const done = insistTwiceAndRate(ctx, 'LOW');
    const picked = done.scoreLedger.filter((e) => e.rule.startsWith('PHARMACY_SAFETY_'));
    expect(picked.map((e) => e.rule)).toEqual([rule]);
    expect(picked[0]?.facts.aiScore).toBe(score);
  });

  it.each([
    ['LOW', 'GATE_CONSEQUENCE_LOW'],
    ['MID', 'GATE_CONSEQUENCE_MID'],
    ['HIGH', 'GATE_CONSEQUENCE_HIGH'],
  ] as const)('後果命中（%s）→ %s；冇命中就唔記', (level, rule) => {
    const hit = insistTwiceAndRate(
      toDecision(withConsequence(1, level), `gs-hit-${level}`, GOOD_SAFETY),
      level,
    );
    expect(rules(hit)).toContain(rule);
    const miss = insistTwiceAndRate(
      toDecision(withConsequence(0, level), `gs-miss-${level}`, GOOD_SAFETY),
      level,
    );
    expect(rules(miss).some((r) => r.startsWith('GATE_CONSEQUENCE_'))).toBe(false);
  });

  it('分數幅度只來自 scoring-rules：改表就改結果', () => {
    const ctx = toDecision(base, 'gs-table', GOOD_SAFETY);
    const bumped: EngineTables = {
      ...base,
      'scoring-rules': base['scoring-rules'].map((r) =>
        r.id === 'GATE_INSISTED_OBJECT' ? { ...r, delta: -7 } : r,
      ),
    };
    const engine = realEngine(bumped);
    const insisted = feed(engine, ctx.state, [
      intentEvent({ type: 'INSIST_ORDER', orderId: ctx.id }),
      intentEvent({ type: 'INSIST_ORDER', orderId: ctx.id }),
    ]);
    const request = aiRequests(insisted.effects).find((r) => r.kind === 'gate.danger');
    const done = feed(engine, insisted.state, [
      {
        type: 'AI_RESULT',
        reqId: request?.reqId ?? '',
        payload: { danger: 'LOW', category: 'ALLERGY', rationale: '' },
      },
    ]).state;
    expect(done.scoreLedger.find((e) => e.rule === 'GATE_INSISTED_OBJECT')?.delta).toBe(-7);
  });
});

describe('AI 評語守衛（回顧文字只來自 engine 事實）', () => {
  const tables: EngineTables = realTables();

  it('合格評語：{{token}} 換成 engine 凍結值，回顧可顯示', () => {
    const ctx = toDecision(base, 'gs-text-ok', {
      score: 6,
      rationale: '已核對 {{patient.allergies}} 嘅紀錄。',
    });
    const done = insistTwiceAndRate(ctx, 'MID', '劑量與 {{order.label}} 相符。');
    const review = buildReview(done, tables);
    const item = review.safety[0];
    expect(item?.aiReason).not.toBeNull();
    expect(item?.aiReason).not.toMatch(/\{\{/u);
    const allergies = Object.values(done.orders)[0]?.gate?.reviews.find((r) => r.by === 'PHARMACY')
      ?.safety?.tokenValues['patient.allergies'];
    expect(allergies).toBeDefined();
    expect(item?.aiReason).toContain(allergies ?? '');
    expect(item?.danger?.reason).not.toBeNull();
  });

  it('含裸數字嘅評語被丟棄：order 照常放行、分數照記，回顧改用事實句（aiReason 為 null）', () => {
    const ctx = toDecision(base, 'gs-text-digit', {
      score: 6,
      rationale: '應該在 10 分鐘內處理。',
    });
    const done = insistTwiceAndRate(ctx, 'LOW', '劑量偏高 20%。');
    const order = Object.values(done.orders)[0];
    expect(order?.status).toBe('RUNNING');
    expect(order?.gate?.reviews.find((r) => r.by === 'PHARMACY')?.safety?.rationale).toBe('');
    expect(rules(done)).toContain('PHARMACY_SAFETY_FAIR');
    const item = buildReview(done, tables).safety[0];
    expect(item?.aiReason).toBeNull();
    expect(item?.danger?.reason).toBeNull();
    expect(item?.aiScore).toBe(6);
  });

  it('未授權 token 嘅評語被丟棄', () => {
    const ctx = toDecision(base, 'gs-text-token', {
      score: 6,
      rationale: '病人 {{patient.diagnosis}}。',
    });
    const done = insistTwiceAndRate(ctx, 'LOW');
    expect(buildReview(done, tables).safety[0]?.aiReason).toBeNull();
  });

  it('回顧顯示前再驗一次：被改動嘅存檔（裸數字／缺 token 值）唔會顯示', () => {
    const ctx = toDecision(base, 'gs-text-tamper', GOOD_SAFETY);
    const done = insistTwiceAndRate(ctx, 'LOW');
    const order = Object.values(done.orders)[0];
    expect(order?.gate).toBeTruthy();
    const tamper = (rationale: string, tokenValues: Record<string, string>): GameState => {
      const copy = structuredClone(done);
      const gate = copy.orders[order?.id ?? '']?.gate;
      for (const review of gate?.reviews ?? []) {
        if (review.safety) review.safety = { ...review.safety, rationale, tokenValues };
      }
      return copy;
    };
    expect(buildReview(tamper('藥量要減 50%。', {}), tables).safety[0]?.aiReason).toBeNull();
    expect(buildReview(tamper('見 {{order.label}}。', {}), tables).safety[0]?.aiReason).toBeNull();
    expect(
      buildReview(tamper('見 {{order.label}}。', { 'order.label': 'X' }), tables).safety[0]
        ?.aiReason,
    ).toBe('見 X。');
  });
});
