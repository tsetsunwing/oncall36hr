/**
 * M3 把關：藥房一律把關、新入職護士唔發 gate 請求、堅持流程、後果由 engine 擲骰（同 seed 可重現）。
 * 用真 content 表跑真 engine；AI 回覆由測試手動餵（AI 只理解，唔決定後果）。
 */
import { describe, expect, it } from 'vitest';
import type { EngineTables } from '../case/tables';
import type { Engine } from '../core/reducer';
import type { JsonValue } from '../core/eventQueue';
import type { GameState, NewGameParams } from '../core/state';
import {
  advance,
  aiRequests,
  answerGates,
  feed,
  intentEvent,
  params,
  realEngine,
  realTables,
  say,
  zeroNoiseTables,
  type Run,
} from '../test/realEngine';

const tables = zeroNoiseTables();
const engine = realEngine(tables);

const fresh = (seed = 'gate-1', over: Partial<NewGameParams> = {}) =>
  engine.init({ ...params(seed), ...over });

/** 將 catalog 一行轉成玩家會打嘅快捷句（藥物要劑量，其他用 alias） */
function phraseFor(row: EngineTables['order-catalog'][number]): string {
  const drug = tables.formulary.find((f) => f.catalogId === row.id);
  if (drug)
    return `${drug.aliases[0] ?? drug.id} 1 ${drug.units[0] ?? 'g'} ${drug.routes[0] ?? ''}`;
  return row.aliases[0] ?? row.label;
}

const requestsOf = (run: Run, kind: string) =>
  aiRequests(run.effects).filter((r) => r.kind === kind);

const ALLERGY_CONCERN = {
  category: 'ALLERGY',
  line: '病人對 {{patient.allergies}} 過敏，{{order.label}} 有交叉風險。',
};

function reply(run: Run, kind: string, payload: JsonValue, state?: GameState): Run {
  const requests = requestsOf(run, kind);
  const events = requests.map((r) => ({ type: 'AI_RESULT' as const, reqId: r.reqId, payload }));
  return feed(engine, state ?? run.state, events);
}

/** 落 Augmentin（penicillin 過敏）：藥房 OBJECT、護士 CONFIRM → 決定點 */
function toDecision(seed = 'gate-1', over: Partial<NewGameParams> = {}): Run {
  const placed = feed(engine, fresh(seed, over), [say('augmentin 1.2 g iv')]);
  const pharmacy = reply(placed, 'gate.pharmacy', {
    verdict: 'OBJECT',
    concerns: [ALLERGY_CONCERN],
    safety: { score: 2, rationale: 'allergy overlap' },
  });
  const nurse = reply(
    placed,
    'gate.nurse',
    { verdict: 'CONFIRM', concerns: [ALLERGY_CONCERN] },
    pharmacy.state,
  );
  return {
    state: nurse.state,
    effects: [...placed.effects, ...pharmacy.effects, ...nurse.effects],
  };
}

const firstOrder = (state: GameState) => Object.values(state.orders)[0];
const insist = (orderId: string) => intentEvent({ type: 'INSIST_ORDER', orderId });

describe('藥房一律把關', () => {
  const drugRows = tables['order-catalog'].filter((r) => r.pharmacyGate);

  it('每個有 pharmacyGate 嘅藥物 order 都發 gate.pharmacy 並以 GATED 等待', () => {
    expect(drugRows.length).toBeGreaterThan(0);
    for (const row of drugRows) {
      const run = feed(engine, fresh(`ph-${row.id}`), [say(phraseFor(row))]);
      expect(requestsOf(run, 'gate.pharmacy'), row.id).toHaveLength(1);
      expect(firstOrder(run.state)?.status, row.id).toBe('GATED');
    }
  });

  it('即使護士選項關閉、護士資歷 NEW，藥房照樣把關', () => {
    const run = feed(engine, fresh('ph-new', { difficulty: 'HARD', nurseConfirmHighRisk: false }), [
      say('paracetamol 500 mg po'),
    ]);
    expect(requestsOf(run, 'gate.pharmacy')).toHaveLength(1);
    expect(requestsOf(run, 'gate.nurse')).toHaveLength(0);
    expect(firstOrder(run.state)?.status).toBe('GATED');
  });

  it('藥房 OK ＋ 護士 OK → 放行：order 開始、護士確認', () => {
    const placed = feed(engine, fresh('ph-ok'), [say('paracetamol 500 mg po')]);
    const done = answerGates(engine, placed);
    const order = firstOrder(done.state);
    expect(order?.status).toBe('RUNNING');
    expect(order?.gate?.phase).toBe('RELEASED');
    expect(done.state.actionLog.find((e) => e.orderId === order?.id)?.reasonCode).toBeNull();
    expect(aiRequests(done.effects).some((r) => r.kind === 'dialogue.turn')).toBe(true);
  });
});

describe('新入職護士：冇提醒、冇 gate 請求', () => {
  it('HARD（NEW 護士）：任何 order 都唔會發 gate.nurse', () => {
    for (const row of tables['order-catalog']) {
      const run = feed(engine, fresh(`new-${row.id}`, { difficulty: 'HARD' }), [
        say(phraseFor(row)),
      ]);
      expect(requestsOf(run, 'gate.nurse'), row.id).toHaveLength(0);
      const order = firstOrder(run.state);
      expect(order, row.id).toBeDefined();
      const reviewers = order?.gate?.reviews.map((r) => r.by) ?? [];
      expect(reviewers, row.id).not.toContain('NURSE');
      if (!row.pharmacyGate) expect(order?.status, row.id).not.toBe('GATED');
    }
  });

  it('資深／普通護士會對藥物發 gate.nurse；高風險 procedure 受設定開關控制', () => {
    const drug = feed(engine, fresh('nm-1'), [say('paracetamol 500 mg po')]);
    expect(requestsOf(drug, 'gate.nurse')).toHaveLength(1);

    const proc = feed(engine, fresh('nm-2'), [say('intubation')]);
    expect(requestsOf(proc, 'gate.nurse')).toHaveLength(1);
    const off = feed(engine, fresh('nm-3', { nurseConfirmHighRisk: false }), [say('intubation')]);
    expect(requestsOf(off, 'gate.nurse')).toHaveLength(0);
    expect(firstOrder(off.state)?.status).toBe('RUNNING');
  });
});

describe('堅持流程', () => {
  it('把關者提出關注 → 決定點（GATED／DECISION），對白寫入 chat，藥房標明電話', () => {
    const run = toDecision();
    const order = firstOrder(run.state);
    expect(order?.status).toBe('GATED');
    expect(order?.gate).toMatchObject({ phase: 'DECISION', required: 2, insistCount: 0 });
    const lines = run.state.chats.p1?.lines ?? [];
    const pharmacy = lines.find((l) => l.speaker.kind === 'PHARMACY');
    expect(pharmacy?.source).toBe('PHONE');
    expect(pharmacy?.tokenValues['patient.allergies']).toBe('Penicillin');
    expect(lines.find((l) => l.speaker.kind === 'NURSE' && l.orderId === order?.id)?.source).toBe(
      'BEDSIDE',
    );
    expect(order?.gate?.reviews.find((r) => r.by === 'PHARMACY')?.safety?.score).toBe(2);
  });

  it('OBJECT 要堅持兩次：第一次 → 再確認（RECONFIRM），第二次 → 評危險度；之後放行', () => {
    let run = toDecision();
    const id = firstOrder(run.state)?.id ?? '';
    run = feed(engine, run.state, [insist(id)]);
    expect(firstOrder(run.state)?.gate).toMatchObject({ phase: 'RECONFIRM', insistCount: 1 });
    const reconfirm = aiRequests(run.effects).find((r) => r.kind === 'dialogue.turn');
    const beats = (reconfirm?.context as { prompt: { beats: { type: string; speaker: string }[] } })
      .prompt.beats;
    expect(beats.map((b) => b.type)).toEqual(['GATE_RECONFIRM', 'GATE_RECONFIRM']);
    expect(beats.map((b) => b.speaker).sort()).toEqual(['NURSE', 'PHARMACY']);

    run = feed(engine, run.state, [insist(id)]);
    expect(firstOrder(run.state)?.gate).toMatchObject({ phase: 'RATING', insistCount: 2 });
    expect(firstOrder(run.state)?.gate?.roll).not.toBeNull();
    const danger = aiRequests(run.effects).filter((r) => r.kind === 'gate.danger');
    expect(danger).toHaveLength(1);

    const rated = feed(engine, run.state, [
      {
        type: 'AI_RESULT',
        reqId: danger[0]?.reqId ?? '',
        payload: { danger: 'LOW', category: 'ALLERGY', rationale: 'x' },
      },
    ]);
    const order = firstOrder(rated.state);
    expect(order?.status).toBe('RUNNING');
    expect(order?.gate?.phase).toBe('RELEASED');
    expect(order?.gate?.danger).toMatchObject({ level: 'LOW', category: 'ALLERGY' });
  });

  it('只有 CONFIRM：堅持一次就去評危險度', () => {
    const placed = feed(engine, fresh('gate-c'), [say('augmentin 1.2 g iv')]);
    const pharmacy = reply(placed, 'gate.pharmacy', { verdict: 'OK', concerns: [] });
    const nurse = reply(
      placed,
      'gate.nurse',
      { verdict: 'CONFIRM', concerns: [ALLERGY_CONCERN] },
      pharmacy.state,
    );
    const id = firstOrder(nurse.state)?.id ?? '';
    expect(firstOrder(nurse.state)?.gate?.required).toBe(1);
    const run = feed(engine, nurse.state, [insist(id)]);
    expect(firstOrder(run.state)?.gate?.phase).toBe('RATING');
  });

  it('未到決定點（審視中／已放行／冇此 order）堅持會被拒絕，state 不變', () => {
    const placed = feed(engine, fresh('gate-r'), [say('augmentin 1.2 g iv')]);
    const id = firstOrder(placed.state)?.id ?? '';
    const early = feed(engine, placed.state, [insist(id)]);
    expect(early.state).toBe(placed.state);
    expect(early.effects).toEqual([{ type: 'NOTICE', kind: 'INSIST_NOT_AVAILABLE', tone: 'warn' }]);
    const unknown = feed(engine, placed.state, [insist('o99')]);
    expect(unknown.effects).toEqual([{ type: 'NOTICE', kind: 'ORDER_UNKNOWN', tone: 'warn' }]);
  });

  it('暫停中唔可以堅持下單', () => {
    const run = toDecision();
    const id = firstOrder(run.state)?.id ?? '';
    const paused = feed(engine, run.state, [intentEvent({ type: 'PAUSE' }), insist(id)]);
    expect(firstOrder(paused.state)?.gate?.insistCount).toBe(0);
  });

  it('把關者句子含裸數字／未授權 token → 視為 AI 失敗：暫停、唔寫入任何對白、order 唔放行', () => {
    const placed = feed(engine, fresh('gate-g'), [say('augmentin 1.2 g iv')]);
    for (const line of [
      '劑量太高，要減到 500 mg。',
      '見 {{vital.secret}}。',
      '病人係肺炎，唔好用。',
    ]) {
      const bad = reply(placed, 'gate.pharmacy', {
        verdict: 'OBJECT',
        concerns: [{ category: 'DOSE_HIGH', line }],
      });
      expect(bad.state.paused?.by, line).toBe('ai-failure');
      expect(bad.state.chats.p1?.lines.length, line).toBe(placed.state.chats.p1?.lines.length);
      expect(firstOrder(bad.state)?.status, line).toBe('GATED');
    }
    const empty = reply(placed, 'gate.pharmacy', { verdict: 'OBJECT', concerns: [] });
    expect(empty.state.paused?.by).toBe('ai-failure');
  });

  it('發畀 AI 嘅 gate prompt 唔含診斷、FSM 狀態、護士資歷或 token 值', () => {
    const placed = feed(engine, fresh('gate-p'), [say('augmentin 1.2 g iv')]);
    for (const request of aiRequests(placed.effects).filter((r) => r.kind.startsWith('gate.'))) {
      const { prompt } = request.context as { prompt: unknown };
      const text = JSON.stringify(prompt);
      expect(text).not.toMatch(/SEPTIC|PNEUMONIA|fsm|seniority|SENIOR|NORMAL|NEW/i);
      expect(text).toContain('penicillin');
    }
  });
});

describe('取消規則', () => {
  it('決定點取消：CANCELLED、冇後果；遲到嘅 AI 結果同堅持都唔會令佢放行', () => {
    const placed = feed(engine, fresh('can-1'), [say('augmentin 1.2 g iv')]);
    const id = firstOrder(placed.state)?.id ?? '';
    const cancelled = feed(engine, placed.state, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: id }),
    ]);
    expect(firstOrder(cancelled.state)?.status).toBe('CANCELLED');
    const late = reply(placed, 'gate.pharmacy', { verdict: 'OK', concerns: [] }, cancelled.state);
    expect(firstOrder(late.state)?.status).toBe('CANCELLED');
    expect(late.state.scheduler).toEqual(cancelled.state.scheduler);
    const again = feed(engine, late.state, [insist(id)]);
    expect(firstOrder(again.state)?.status).toBe('CANCELLED');
  });

  it('暫停中可以取消等把關嘅 order（S-6）', () => {
    const run = toDecision('can-2');
    const id = firstOrder(run.state)?.id ?? '';
    const paused = feed(engine, run.state, [intentEvent({ type: 'PAUSE' })]);
    const cancelled = feed(engine, paused.state, [
      intentEvent({ type: 'CANCEL_ORDER', orderId: id }),
    ]);
    expect(firstOrder(cancelled.state)?.status).toBe('CANCELLED');
    expect(cancelled.state.paused).not.toBeNull();
  });

  it('評危險度期間取消：遲到嘅 gate.danger 結果唔套用任何後果', () => {
    let run = toDecision('can-3');
    const id = firstOrder(run.state)?.id ?? '';
    run = feed(engine, run.state, [insist(id), insist(id)]);
    const danger = aiRequests(run.effects).find((r) => r.kind === 'gate.danger');
    const cancelled = feed(engine, run.state, [intentEvent({ type: 'CANCEL_ORDER', orderId: id })]);
    const late = feed(engine, cancelled.state, [
      {
        type: 'AI_RESULT',
        reqId: danger?.reqId ?? '',
        payload: { danger: 'HIGH', category: 'ALLERGY', rationale: '' },
      },
    ]);
    expect(firstOrder(late.state)?.status).toBe('CANCELLED');
    expect(late.state.patients.p1?.hidden.activeEffects).toEqual([]);
  });
});

function tablesWithConsequence(
  p: number,
  mode: 'IMMEDIATE' | 'DELAYED' | 'REVIEW_ONLY',
): EngineTables {
  const effect = {
    delta: { hr: 20 },
    delaySec: 0,
    rampSec: 60,
    durationSec: null,
    setsFlags: ['adverse.test'],
  };
  const level = {
    p,
    mode,
    ...(mode === 'DELAYED' ? { delayMinSec: 600, delayMaxSec: 1800 } : {}),
    effect: mode === 'REVIEW_ONLY' ? null : effect,
  };
  return {
    ...tables,
    consequences: tables.consequences.map((row) => ({
      ...row,
      levels: { LOW: level, MID: level, HIGH: level },
    })),
  };
}

function runInsist(eng: Engine, seed: string, danger: 'LOW' | 'MID' | 'HIGH' = 'HIGH'): Run {
  const placed = feed(eng, eng.init(params(seed)), [say('augmentin 1.2 g iv')]);
  const answerWith = (kind: string, payload: JsonValue, state: GameState) =>
    feed(
      eng,
      state,
      aiRequests(placed.effects)
        .filter((r) => r.kind === kind)
        .map((r) => ({ type: 'AI_RESULT' as const, reqId: r.reqId, payload })),
    );
  const pharmacy = answerWith(
    'gate.pharmacy',
    { verdict: 'OBJECT', concerns: [ALLERGY_CONCERN] },
    placed.state,
  );
  const nurse = answerWith(
    'gate.nurse',
    { verdict: 'CONFIRM', concerns: [ALLERGY_CONCERN] },
    pharmacy.state,
  );
  const id = Object.values(nurse.state.orders)[0]?.id ?? '';
  const insisted = feed(eng, nurse.state, [insist(id), insist(id)]);
  const request = aiRequests(insisted.effects).find((r) => r.kind === 'gate.danger');
  return feed(eng, insisted.state, [
    {
      type: 'AI_RESULT',
      reqId: request?.reqId ?? '',
      payload: { danger, category: 'ALLERGY', rationale: 'r' },
    },
  ]);
}

describe('後果（consequence stream，固定機率）', () => {
  it('IMMEDIATE：命中即刻加生理效果、flag 同事件記錄；vitals 隨後轉變', () => {
    const eng = realEngine(tablesWithConsequence(1, 'IMMEDIATE'));
    const run = runInsist(eng, 'cq-1');
    const patient = run.state.patients.p1;
    expect(firstOrder(run.state)?.gate?.rolled).toMatchObject({ hit: true, mode: 'IMMEDIATE' });
    expect(patient?.hidden.activeEffects).toHaveLength(1);
    expect(patient?.hidden.fsm.flags).toContain('adverse.test');
    expect(run.state.actionLog.some((e) => e.reasonCode === 'ADVERSE_EVENT')).toBe(true);
    const hr0 = patient?.visible.vitals.hr ?? 0;
    const later = advance(eng, run.state, 300);
    expect(later.state.patients.p1?.visible.vitals.hr).toBeGreaterThan(hr0 + 5);
  });

  it('DELAYED：命中先排程，delay 喺表入面範圍；onset 前冇效果，onset 後有', () => {
    const eng = realEngine(tablesWithConsequence(1, 'DELAYED'));
    const run = runInsist(eng, 'cq-2');
    const rolled = firstOrder(run.state)?.gate?.rolled;
    expect(rolled?.mode).toBe('DELAYED');
    expect(rolled?.delaySec).toBeGreaterThanOrEqual(600);
    expect(rolled?.delaySec).toBeLessThanOrEqual(1800);
    expect(run.state.patients.p1?.hidden.activeEffects).toEqual([]);
    const past = advance(eng, run.state, (rolled?.delaySec ?? 0) + 1);
    expect(past.state.patients.p1?.hidden.activeEffects).toHaveLength(1);
    expect(past.state.actionLog.filter((e) => e.reasonCode === 'ADVERSE_EVENT')).toHaveLength(1);
  });

  it('REVIEW_ONLY：命中亦唔會改病人任何狀態（只留作賽後回顧）', () => {
    const eng = realEngine(tablesWithConsequence(1, 'REVIEW_ONLY'));
    const run = runInsist(eng, 'cq-3');
    expect(firstOrder(run.state)?.gate?.rolled).toMatchObject({ hit: true, mode: 'REVIEW_ONLY' });
    expect(run.state.patients.p1?.hidden.activeEffects).toEqual([]);
    expect(run.state.actionLog.some((e) => e.reasonCode === 'ADVERSE_EVENT')).toBe(false);
  });

  it('機率 0：永遠冇後果；機率 1：永遠有後果', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      const none = runInsist(realEngine(tablesWithConsequence(0, 'IMMEDIATE')), seed);
      expect(firstOrder(none.state)?.gate?.rolled?.hit).toBe(false);
      const all = runInsist(realEngine(tablesWithConsequence(1, 'IMMEDIATE')), seed);
      expect(firstOrder(all.state)?.gate?.rolled?.hit).toBe(true);
    }
  });

  it('同 seed 完全重現；唔同 seed 命中結果（p=0.5）會有分別', () => {
    const eng = realEngine(tablesWithConsequence(0.5, 'IMMEDIATE'));
    const a = runInsist(eng, 'repro-1');
    const b = runInsist(eng, 'repro-1');
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const hits = new Set(
      Array.from(
        { length: 24 },
        (_, i) => firstOrder(runInsist(eng, `seed-${String(i)}`).state)?.gate?.rolled?.hit,
      ),
    );
    expect(hits).toEqual(new Set([true, false]));
  });

  it('擲骰喺堅持到位嗰刻就抽好：AI 評級幾時回都唔影響結果，亦只用 consequence stream', () => {
    const eng = realEngine(tablesWithConsequence(0.5, 'IMMEDIATE'));
    const run = runInsist(eng, 'order-indep');
    const gate = firstOrder(run.state)?.gate;
    expect(gate?.roll?.value).toBeDefined();
    expect(gate?.rolled?.hit).toBe((gate?.roll?.value ?? 1) < 0.5);

    const fresh0 = eng.init(params('order-indep'));
    expect(run.state.rng.consequence).not.toBe(fresh0.rng.consequence);
    expect(run.state.rng.events).toBe(fresh0.rng.events);
    expect(run.state.rng.cpr).toBe(fresh0.rng.cpr);
    expect(run.state.rng.calls).toBe(fresh0.rng.calls);
    expect(run.state.rng.staff).toBe(fresh0.rng.staff);
  });

  it('shipped T11 表：LOW 唔會有生理效果；MID／HIGH 設定喺 PENDING_CLINICAL_REVIEW 之下', () => {
    for (const row of realTables().consequences) {
      expect(row.levels.LOW.effect).toBeNull();
      expect(row.reviewStatus).toBe('PENDING_CLINICAL_REVIEW');
    }
  });
});
