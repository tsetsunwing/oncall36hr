import { describe, expect, it } from 'vitest';
import { enqueue } from '../core/eventQueue';
import type { EngineEvent } from '../core/events';
import type { GameState, NewGameParams } from '../core/state';
import {
  advance,
  aiRequests,
  feed,
  fullTables,
  intentEvent,
  realConfig,
  realEngine,
} from '../test/realEngine';
import { handleCallArrival } from './calls';
import { plannedCallCount, shiftSeconds } from './generate';
import type { Call, DelegationTaskId, Rank } from './wardTypes';

const engine = realEngine();
const config = realConfig();

const wardParams = (
  seed: string,
  playerRank: NewGameParams['playerRank'] = 'MO',
  difficulty: NewGameParams['difficulty'] = 'MEDIUM',
  mode: NewGameParams['mode'] = 'NIGHT',
): NewGameParams => ({ seed, mode, difficulty, playerRank, ward: true });

const ward = (name: string, payload: Record<string, unknown>): EngineEvent =>
  intentEvent({ type: 'EXTENSION', module: 'ward', name, payload: payload as never });

function patientsOf(state: GameState) {
  return Object.values(state.patients);
}

function injectCall(
  state: GameState,
  templateId: string,
  patientId: string,
  overrides: Partial<Call> = {},
): GameState {
  const id = `k${String(state.ward.counters.call + 1)}`;
  const call: Call = {
    id,
    templateId,
    direction: 'IN',
    tag: 'NURSE',
    priority: 'URGENT',
    callerName: 'X',
    callerRank: null,
    patientId,
    deptId: null,
    target: null,
    status: 'RINGING',
    resolution: null,
    arrivedAt: state.clock.t,
    expiresAt: state.clock.t + 9999,
    ringAgainAt: null,
    defers: 0,
    delegable: false,
    sbar: null,
    outcome: null,
    lines: [],
    purpose: 'GENERAL',
    exchange: null,
    ...overrides,
  };
  return {
    ...state,
    ward: {
      ...state.ward,
      calls: [...state.ward.calls, call],
      counters: { ...state.ward.counters, call: state.ward.counters.call + 1 },
    },
  };
}

describe('病房生成', () => {
  it('20 床固定，佔床數按難度範圍，病人唔同床', () => {
    for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
      const profile = engine.tables['difficulty-profiles'].find((p) => p.id === difficulty);
      for (let i = 0; i < 6; i++) {
        const state = engine.init(wardParams(`gen-${difficulty}-${String(i)}`, 'HO', difficulty));
        const beds = patientsOf(state).map((p) => p.bed);
        expect(new Set(beds).size).toBe(beds.length);
        expect(beds.every((b) => b >= 1 && b <= 20)).toBe(true);
        expect(beds.length).toBeGreaterThanOrEqual(profile?.occupancy.min ?? 99);
        expect(beds.length).toBeLessThanOrEqual(profile?.occupancy.max ?? 0);
      }
    }
  });

  it('同 seed 同一個病房；唔同 seed 通常唔同', () => {
    const a = engine.init(wardParams('same'));
    const b = engine.init(wardParams('same'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const layouts = new Set(
      Array.from({ length: 8 }, (_, i) =>
        patientsOf(engine.init(wardParams(`diff-${String(i)}`)))
          .map((p) => `${String(p.bed)}:${p.hidden.caseTemplateId}`)
          .join(','),
      ),
    );
    expect(layouts.size).toBeGreaterThan(1);
  });

  it('病情複雜度取難度同職級較高者（S-5 B）', () => {
    const complexCount = (
      rank: NewGameParams['playerRank'],
      difficulty: NewGameParams['difficulty'],
    ) => {
      let complex = 0;
      let total = 0;
      for (let i = 0; i < 10; i++) {
        const state = engine.init(
          wardParams(`cx-${rank}-${difficulty}-${String(i)}`, rank, difficulty),
        );
        for (const patient of patientsOf(state)) {
          total++;
          const row = engine.tables['case-templates'].find(
            (c) => c.id === patient.hidden.caseTemplateId,
          );
          if (row?.complexity === 'COMPLEX') complex++;
        }
      }
      return complex / total;
    };
    const easyHo = complexCount('HO', 'EASY');
    const easyRes = complexCount('RES', 'EASY');
    const hardHo = complexCount('HO', 'HARD');
    const hardRes = complexCount('RES', 'HARD');
    expect(easyRes).toBeGreaterThan(easyHo + 0.2);
    expect(easyRes).toBeCloseTo(hardRes, 1);
    expect(hardHo).toBeCloseTo(hardRes, 1);
  });

  it('護士按區分配：A 區同 B 區唔同一位', () => {
    const state = engine.init(wardParams('nurses', 'MO', 'HARD'));
    const nurseByZone = new Map<string, Set<string>>();
    for (const patient of patientsOf(state)) {
      const nurse = state.chats[patient.id]?.present.find((p) => p.kind === 'NURSE');
      const zone = patient.bed <= 10 ? 'A' : 'B';
      nurseByZone.set(zone, (nurseByZone.get(zone) ?? new Set()).add(nurse?.id ?? '?'));
    }
    for (const ids of nurseByZone.values()) expect(ids.size).toBe(1);
    if (nurseByZone.size === 2) {
      expect([...(nurseByZone.get('A') ?? [])][0]).not.toBe([...(nurseByZone.get('B') ?? [])][0]);
    }
  });

  it('舊式（唔開 ward）仍然係單一病人 p1、7 號床', () => {
    const state = engine.init({
      seed: 'legacy',
      mode: 'NIGHT',
      difficulty: 'MEDIUM',
      playerRank: 'MO',
    });
    expect(Object.keys(state.patients)).toEqual(['p1']);
    expect(state.patients.p1?.bed).toBe(7);
    expect(state.ward.enabled).toBe(false);
  });
});

describe('下屬（S-1 A）', () => {
  it('HO 冇下屬；MO／RES 恰好一位', () => {
    for (let i = 0; i < 6; i++) {
      expect(engine.init(wardParams(`s-ho-${String(i)}`, 'HO')).ward.sub).toBeNull();
      const mo = engine.init(wardParams(`s-mo-${String(i)}`, 'MO')).ward.sub;
      const res = engine.init(wardParams(`s-res-${String(i)}`, 'RES')).ward.sub;
      expect(mo?.rank).toBe('HO');
      expect(res?.rank).toBe('MO');
    }
  });

  it('下屬資歷三種都會出現（唔同 seed）', () => {
    const levels = new Set(
      Array.from(
        { length: 30 },
        (_, i) => engine.init(wardParams(`lv-${String(i)}`, 'MO')).ward.sub?.level,
      ),
    );
    expect(levels).toEqual(new Set(['NOVICE', 'NORMAL', 'SENIOR']));
  });
});

describe('來電量（T12）', () => {
  it('排程來電數 ＝ 每小時基礎量 × 時數 × (1 ＋ 難度加成)', () => {
    for (const mode of ['DAY', 'NIGHT', 'ONCALL'] as const) {
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
        const state = engine.init(wardParams(`vol-${mode}-${difficulty}`, 'MO', difficulty, mode));
        const planned = state.scheduler.items.filter((e) => e.kind === 'CALL_ARRIVAL').length;
        const uplift = config.difficulty.phoneVolumeUplift[difficulty];
        const expected = Math.round(
          config.phone.baseCallsPerHour * (shiftSeconds(config, mode) / 3600) * (1 + uplift),
        );
        expect(planned).toBe(expected);
        expect(planned).toBe(plannedCallCount(config, mode, uplift));
        expect(state.ward.plannedCalls).toBe(expected);
      }
    }
  });

  it('難度加成係 +0／+10%／+20%', () => {
    const night = (d: 'EASY' | 'MEDIUM' | 'HARD') =>
      engine.init(wardParams('uplift', 'MO', d)).ward.plannedCalls;
    expect(night('MEDIUM') / night('EASY')).toBeCloseTo(1.1, 1);
    expect(night('HARD') / night('EASY')).toBeCloseTo(1.2, 1);
  });

  it('跑完一更，可見來電不多過排程（隨機藥房核對唔再佔一個來電）', () => {
    let state = engine.init(wardParams('full-shift', 'MO', 'MEDIUM', 'DAY'));
    const planned = state.ward.plannedCalls;
    state = advance(engine, state, shiftSeconds(config, 'DAY')).state;
    const incoming = state.ward.calls.filter((c) => c.direction === 'IN');
    expect(incoming.every((call) => call.templateId !== 'PHARMACY_QUERY')).toBe(true);
    expect(incoming.length).toBeLessThanOrEqual(planned);
    expect(incoming.length).toBeGreaterThan(0);
  });

  it('來電有標籤，護士來電同低階醫生來電分開', () => {
    let state = engine.init(wardParams('tags', 'MO', 'HARD', 'DAY'));
    state = advance(engine, state, 30000).state;
    const tags = new Set(state.ward.calls.map((c) => c.tag));
    expect(tags.has('NURSE')).toBe(true);
    expect(
      [...tags].every((tag) =>
        ['NURSE', 'JUNIOR', 'LAB', 'XRAY', 'PHARMACY', 'DEPT'].includes(tag),
      ),
    ).toBe(true);
  });

  it('HO 收唔到低階醫生來電（冇下屬）', () => {
    let state = engine.init(wardParams('ho-calls', 'HO', 'HARD', 'DAY'));
    state = advance(engine, state, 36000).state;
    expect(state.ward.calls.some((c) => c.tag === 'JUNIOR')).toBe(false);
  });

  it('人已經喺床邊，護士同駐院醫生唔會再打關於呢個病人嘅電話', () => {
    let state = engine.init(wardParams('beside-quiet', 'MO', 'HARD', 'DAY'));
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = feed(engine, state, [ward('GO_TO_BED', { bed: target.bed })]).state;
    expect(state.ward.location.bed).toBe(target.bed);
    const started = state.clock.t;
    state = advance(engine, state, 8 * 3600).state;
    const aboutHere = state.ward.calls.filter(
      (call) =>
        call.arrivedAt >= started &&
        (call.tag === 'NURSE' || call.tag === 'JUNIOR') &&
        call.patientId === target.id,
    );
    expect(aboutHere).toEqual([]);
    expect(state.ward.calls.some((call) => call.arrivedAt >= started)).toBe(true);
  });
});

describe('三種來電回應有後果', () => {
  const base = () => engine.init(wardParams('responses', 'MO', 'MEDIUM', 'NIGHT'));

  it('GO_NOW：入帳、走去床邊', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = injectCall(state, 'NURSE_SPO2', target.id);
    const callId = state.ward.calls[0]?.id ?? '';
    const run = feed(engine, state, [ward('RESPOND_CALL', { callId, response: 'GO_NOW' })]);
    expect(run.state.ward.calls[0]?.status).toBe('DONE');
    expect(run.state.scoreLedger.map((l) => l.rule)).toContain('CALL_GO_NOW');
    const arrived =
      run.state.ward.location.bed === target.bed || run.state.ward.location.movingTo === target.bed;
    expect(arrived).toBe(true);
  });

  it('LATER：延後再響，扣分；超過上限等同漏接', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = injectCall(state, 'NURSE_SPO2', target.id);
    const callId = state.ward.calls[0]?.id ?? '';
    let run = feed(engine, state, [ward('RESPOND_CALL', { callId, response: 'LATER' })]);
    expect(run.state.ward.calls[0]).toMatchObject({ status: 'DEFERRED', defers: 1 });
    expect(run.state.scoreLedger.map((l) => l.rule)).toContain('CALL_LATER');
    run = advance(engine, run.state, config.phone.laterDelaySec + 1);
    expect(run.state.ward.calls[0]?.status).toBe('RINGING');
    for (let i = 0; i < config.phone.maxDefers; i++) {
      run = feed(engine, run.state, [ward('RESPOND_CALL', { callId, response: 'LATER' })]);
      run = advance(engine, run.state, config.phone.laterDelaySec + 1);
    }
    expect(run.state.ward.calls[0]?.status).toBe('MISSED');
  });

  it('CONTINUE：護士緊急來電冇處理，病人標記 unattended_call', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = injectCall(state, 'NURSE_SPO2', target.id);
    const callId = state.ward.calls[0]?.id ?? '';
    const run = feed(engine, state, [ward('RESPOND_CALL', { callId, response: 'CONTINUE' })]);
    expect(run.state.ward.calls[0]?.status).toBe('DONE');
    expect(run.state.scoreLedger.map((l) => l.rule)).toContain('CALL_CONTINUE');
    expect(run.state.patients[target.id]?.hidden.fsm.flags).toContain('unattended_call');
  });

  it('漏接：過期扣分；低階醫生漏接令其印象下降，病人標記 unattended_call', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = injectCall(state, 'JUNIOR_REVIEW', target.id, {
      tag: 'JUNIOR',
      callerRank: 'HO',
      expiresAt: state.clock.t + 5,
    });
    const callId = state.ward.calls[0]?.id ?? '';
    state = {
      ...state,
      scheduler: enqueue(state.scheduler, {
        time: state.clock.t + 5,
        priority: 20,
        kind: 'CALL_EXPIRE',
        payload: { callId },
      }),
    };
    const before = state.ward.impressions.HO ?? 0;
    const run = advance(engine, state, 10);
    expect(run.state.ward.calls[0]?.status).toBe('MISSED');
    expect(run.state.scoreLedger.map((l) => l.rule)).toContain('CALL_MISSED_JUNIOR');
    expect(run.state.ward.impressions.HO ?? 0).toBeLessThan(before);
    expect(run.state.patients[target.id]?.hidden.fsm.flags).toContain('unattended_call');
  });

  it('行到病人床邊，未接嘅護士同駐院醫生來電標成已到床邊', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = injectCall(state, 'NURSE_SPO2', target.id);
    state = injectCall(state, 'JUNIOR_REVIEW', target.id, { tag: 'JUNIOR', callerRank: 'HO' });
    const run = feed(engine, state, [ward('GO_TO_BED', { bed: target.bed })]);
    expect(run.state.ward.location.bed).toBe(target.bed);
    expect(run.state.ward.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          templateId: 'NURSE_SPO2',
          status: 'DONE',
          resolution: 'ATTENDED',
        }),
        expect.objectContaining({
          templateId: 'JUNIOR_REVIEW',
          status: 'DONE',
          resolution: 'ATTENDED',
        }),
      ]),
    );
    expect(run.state.scoreLedger.map((entry) => entry.rule)).not.toContain('CALL_MISSED');
    expect(run.state.scoreLedger.map((entry) => entry.rule)).not.toContain('CALL_MISSED_JUNIOR');
  });

  it('人已經喺床邊，延後嘅護士來電唔會再響', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = feed(engine, state, [ward('GO_TO_BED', { bed: target.bed })]).state;
    const ringAt = state.clock.t + 30;
    state = injectCall(state, 'NURSE_ROUTINE', target.id, {
      status: 'DEFERRED',
      ringAgainAt: ringAt,
      priority: 'ROUTINE',
    });
    const callId = state.ward.calls.at(-1)?.id ?? '';
    state = {
      ...state,
      scheduler: enqueue(state.scheduler, {
        time: ringAt,
        priority: 20,
        kind: 'CALL_RING_AGAIN',
        payload: { callId },
      }),
    };
    const run = advance(engine, state, 40);
    expect(run.state.ward.calls.find((call) => call.id === callId)).toMatchObject({
      status: 'DONE',
      resolution: 'ATTENDED',
    });
  });

  it('未知來電 id 被拒', () => {
    const state = base();
    const run = feed(engine, state, [ward('RESPOND_CALL', { callId: 'nope', response: 'GO_NOW' })]);
    expect(run.effects.some((e) => e.type === 'NOTICE' && e.kind === 'CALL_UNKNOWN')).toBe(true);
  });

  it('暫停時唔接受來電回應', () => {
    let state = base();
    const target = patientsOf(state)[0];
    if (!target) throw new Error('no patient');
    state = injectCall(state, 'NURSE_ROUTINE', target.id, { priority: 'ROUTINE' });
    const callId = state.ward.calls[0]?.id ?? '';
    const run = feed(engine, state, [
      intentEvent({ type: 'PAUSE' }),
      ward('RESPOND_CALL', { callId, response: 'GO_NOW' }),
    ]);
    expect(run.state.ward.calls[0]?.status).toBe('RINGING');
    expect(run.effects.some((e) => e.type === 'NOTICE' && e.kind === 'ORDER_BLOCKED_PAUSED')).toBe(
      true,
    );
  });
});

describe('步步上報（S-3）', () => {
  const rankOf = (state: GameState, rank: Rank) => state.ward.impressions[rank] ?? 0;
  const escalate = (state: GameState, target: Rank): GameState => {
    const patient = patientsOf(state)[0];
    if (!patient) throw new Error('no patient');
    return feed(engine, state, [
      ward('PREPARE_CALL', { patientId: patient.id, target: { kind: 'RANK', rank: target } }),
      ward('SEND_CALL', { sbar: state.ward.draft?.sbar ?? { S: 'x', B: 'x', A: 'x', R: 'x' } }),
    ]).state;
  };
  const prepare = (state: GameState, target: Rank): GameState => {
    const patient = patientsOf(state)[0];
    if (!patient) throw new Error('no patient');
    return feed(engine, state, [
      ward('PREPARE_CALL', { patientId: patient.id, target: { kind: 'RANK', rank: target } }),
    ]).state;
  };

  it('逐級上報（MO→RES）冇罰；SBAR 預填四段', () => {
    let state = prepare(engine.init(wardParams('esc-1', 'MO')), 'RES');
    expect(state.ward.draft?.sbar.S.length).toBeGreaterThan(0);
    expect(state.ward.draft?.sbar.R.length).toBeGreaterThan(0);
    state = feed(engine, state, [
      ward('SEND_CALL', { sbar: state.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' } }),
    ]).state;
    const rules = state.scoreLedger.map((l) => l.rule);
    expect(rules).toContain('ESCALATION_STEP_OK');
    expect(rules).not.toContain('ESCALATION_SKIPPED_LEVEL');
  });

  it('越級（MO 直接叫 AC）：扣分，被越過嘅 RES 印象下降', () => {
    const init = engine.init(wardParams('esc-2', 'MO'));
    const resBefore = rankOf(init, 'RES');
    const prepared = prepare(init, 'AC');
    const state = feed(engine, prepared, [
      ward('SEND_CALL', { sbar: prepared.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' } }),
    ]).state;
    expect(state.scoreLedger.map((l) => l.rule)).toContain('ESCALATION_SKIPPED_LEVEL');
    expect(rankOf(state, 'RES')).toBeLessThan(resBefore);
    const skipRule = engine.tables['scoring-rules'].find(
      (r) => r.id === 'ESCALATION_SKIPPED_LEVEL',
    );
    expect(rankOf(state, 'RES')).toBe(resBefore + (skipRule?.impression?.delta ?? 0));
    expect(rankOf(state, 'MO')).toBe(rankOf(init, 'MO'));
  });

  it('先叫咗 RES 再叫 AC：唔算越級', () => {
    let state = engine.init(wardParams('esc-3', 'MO'));
    state = escalate(prepare(state, 'RES'), 'RES');
    state = escalate(prepare(state, 'AC'), 'AC');
    expect(state.scoreLedger.map((l) => l.rule)).not.toContain('ESCALATION_SKIPPED_LEVEL');
  });

  it('越兩級：兩個被越過嘅職級都下降（HO 直接叫 COS）', () => {
    const init = engine.init(wardParams('esc-4', 'HO'));
    const prepared = prepare(init, 'COS');
    const state = feed(engine, prepared, [
      ward('SEND_CALL', { sbar: prepared.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' } }),
    ]).state;
    for (const rank of ['MO', 'RES', 'AC'] as const) {
      expect(rankOf(state, rank)).toBeLessThan(rankOf(init, rank));
    }
  });

  it('唔可以打俾自己或者較低職級', () => {
    const init = engine.init(wardParams('esc-5', 'RES'));
    const patient = patientsOf(init)[0];
    const run = feed(engine, init, [
      ward('PREPARE_CALL', {
        patientId: patient?.id ?? 'p1',
        target: { kind: 'RANK', rank: 'MO' },
      }),
    ]);
    expect(run.state.ward.draft).toBeNull();
    expect(run.effects.some((e) => e.type === 'NOTICE' && e.kind === 'CALL_TARGET_INVALID')).toBe(
      true,
    );
  });

  it('SBAR 段落被清空令清晰度下降，被叫方唔肯到床邊', () => {
    let state = prepare(engine.init(wardParams('esc-6', 'MO')), 'RES');
    const sent = feed(engine, state, [ward('SEND_CALL', { sbar: { S: '', B: '', A: '', R: '' } })]);
    const request = aiRequests(sent.effects).find((r) => r.kind === 'consult.assess');
    expect(request).toBeDefined();
    state = feed(engine, sent.state, [
      {
        type: 'AI_RESULT',
        reqId: request?.reqId ?? '',
        payload: { parts: { S: [], B: [], A: [], R: [] }, quoted: [], tone: 'NEUTRAL' },
      },
    ]).state;
    const out = state.ward.calls.find((c) => c.direction === 'OUT');
    expect(out?.outcome).toBe('REFUSE');
    expect(state.scoreLedger.map((l) => l.rule)).toContain('SBAR_POOR');
  });

  it('清晰 SBAR：上級到床邊，病人記錄有 senior.reviewed', () => {
    let state = prepare(engine.init(wardParams('esc-7', 'MO')), 'RES');
    const patientId = state.ward.draft?.patientId ?? '';
    state = feed(engine, state, [
      ward('SEND_CALL', { sbar: state.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' } }),
    ]).state;
    expect(state.ward.calls.find((c) => c.direction === 'OUT')?.outcome).toBe('BEDSIDE');
    state = advance(engine, state, 1500).state;
    expect(state.patients[patientId]?.hidden.fsm.flags).toContain('senior.reviewed');
    expect(state.scoreLedger.map((l) => l.rule)).toContain('SBAR_GOOD');
  });

  it('其他專科會診（雙向）：外撥 Cardiology；ICU 按 MEWS 接收或拒絕', () => {
    let state = engine.init(wardParams('consult-1', 'MO'));
    const patient = patientsOf(state)[0];
    state = feed(engine, state, [
      ward('PREPARE_CALL', {
        patientId: patient?.id ?? 'p1',
        target: { kind: 'DEPT', deptId: 'ICU' },
      }),
    ]).state;
    state = feed(engine, state, [
      ward('SEND_CALL', { sbar: state.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' } }),
    ]).state;
    const out = state.ward.calls.find((c) => c.direction === 'OUT');
    expect(out?.outcome).toBe('ICU_ASSESS');
    state = advance(engine, state, 1300).state;
    const done = state.ward.calls.find((c) => c.direction === 'OUT');
    expect(['ICU_ACCEPT', 'ICU_DECLINE']).toContain(done?.outcome);
    const incoming = engine.tables['call-templates'].some(
      (r) => r.kind === 'CALL' && r.tag === 'DEPT',
    );
    expect(incoming).toBe(true);
  });

  it('drug chart 覆核唔會隨機來電', () => {
    const source = fullTables();
    const tables = {
      ...source,
      'call-templates': source['call-templates'].map((row) =>
        row.id === 'NURSE_DRUGCHART' ? { ...row, weight: 100 } : { ...row, weight: 0 },
      ),
    };
    const state = engine.init(wardParams('drugchart-pool'));
    expect(Object.keys(state.patients).length).toBeGreaterThan(0);
    const reduced = handleCallArrival(state, { config, tables });
    expect(reduced.state.ward.calls.some((call) => call.templateId === 'NURSE_DRUGCHART')).toBe(
      false,
    );
  });
});

describe('委派（S-1、S-4）', () => {
  const delegateOnce = (
    seed: string,
    rank: NewGameParams['playerRank'],
    task: DelegationTaskId,
    itemId: string,
    patientId: string | null = 'p1',
  ) => {
    const state = engine.init(wardParams(seed, rank));
    return feed(engine, state, [ward('DELEGATE', { task, itemId, patientId, callId: null })]);
  };

  it('HO 冇下屬，委派被拒', () => {
    const run = delegateOnce('del-ho', 'HO', 'PROCEDURE', 'lab.cbc');
    expect(run.effects.some((e) => e.type === 'NOTICE' && e.kind === 'DELEGATE_NO_SUB')).toBe(true);
    expect(run.state.ward.tasks).toHaveLength(0);
  });

  it('MO 委派抽血：落咗單、下屬轉忙、再委派被拒', () => {
    const run = delegateOnce('del-mo', 'MO', 'PROCEDURE', 'lab.cbc');
    expect(run.state.ward.tasks).toHaveLength(1);
    const orderId = run.state.ward.tasks[0]?.orderId ?? '';
    expect(run.state.orders[orderId]?.executorKind).toBe('SUBORDINATE');
    const again = feed(engine, run.state, [
      ward('DELEGATE', { task: 'PROCEDURE', itemId: 'lab.abg', patientId: 'p1', callId: null }),
    ]);
    expect(again.effects.some((e) => e.type === 'NOTICE' && e.kind === 'DELEGATE_BUSY')).toBe(true);
    expect(again.state.ward.tasks).toHaveLength(1);
  });

  it('無關項目、冇病人、冇 tag 嘅委派都被拒', () => {
    const bad = delegateOnce('del-bad', 'MO', 'PROCEDURE', 'does.not.exist');
    expect(bad.effects.some((e) => e.type === 'NOTICE' && e.kind === 'DELEGATE_INVALID')).toBe(
      true,
    );
    const noTag = delegateOnce('del-notag', 'MO', 'ADMISSION', 'admission.workup');
    expect(noTag.effects.some((e) => e.type === 'NOTICE' && e.kind === 'DELEGATE_INVALID')).toBe(
      true,
    );
  });

  it('下屬做嘅 order 完成時間按資歷：新手慢過老手（可由實際完成時間觀察，唔係標籤）', () => {
    const durations: Record<string, number[]> = { NOVICE: [], NORMAL: [], SENIOR: [] };
    for (let i = 0; i < 120; i++) {
      const state = engine.init(wardParams(`speed-${String(i)}`, 'MO'));
      const level = state.ward.sub?.level;
      if (!level) continue;
      const run = feed(engine, state, [
        ward('DELEGATE', {
          task: 'ORDER_NOTE',
          itemId: 'ecg.12lead',
          patientId: 'p1',
          callId: null,
        }),
      ]);
      const task = run.state.ward.tasks[0];
      if (task?.mode === 'OK') durations[level]?.push(task.completesAt - task.startsAt);
    }
    const mean = (values: number[]) =>
      values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    expect(durations.NOVICE?.length).toBeGreaterThan(0);
    expect(mean(durations.NOVICE ?? [])).toBeCloseTo(300 * 1.5, 0);
    expect(mean(durations.NORMAL ?? [])).toBeCloseTo(300, 0);
    expect(mean(durations.SENIOR ?? [])).toBeCloseTo(300 * 0.8, 0);
  });

  it('可靠度 70／85／95%：大量擲骰命中率接近表值', () => {
    const rates: Record<string, { ok: number; total: number }> = {
      NOVICE: { ok: 0, total: 0 },
      NORMAL: { ok: 0, total: 0 },
      SENIOR: { ok: 0, total: 0 },
    };
    for (let i = 0; i < 900; i++) {
      const state = engine.init(wardParams(`rel-${String(i)}`, 'MO'));
      const level = state.ward.sub?.level;
      if (!level) continue;
      const run = feed(engine, state, [
        ward('DELEGATE', {
          task: 'ORDER_NOTE',
          itemId: 'ecg.12lead',
          patientId: 'p1',
          callId: null,
        }),
      ]);
      const bucket = rates[level];
      if (!bucket) continue;
      bucket.total++;
      if (run.state.ward.tasks[0]?.mode === 'OK') bucket.ok++;
    }
    const rate = (level: string) => (rates[level]?.ok ?? 0) / Math.max(1, rates[level]?.total ?? 1);
    expect(rate('NOVICE')).toBeGreaterThan(0.6);
    expect(rate('NOVICE')).toBeLessThan(0.8);
    expect(rate('NORMAL')).toBeGreaterThan(0.77);
    expect(rate('NORMAL')).toBeLessThan(0.93);
    expect(rate('SENIOR')).toBeGreaterThan(0.89);
    expect(rate('NOVICE')).toBeLessThan(rate('SENIOR'));
  });

  it('失敗嘅 order 唔生效（FAILED），責任喺玩家：計分流水有 DELEGATION_FAILED', () => {
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      const state = engine.init(wardParams(`fail-${String(i)}`, 'MO'));
      const run = feed(engine, state, [
        ward('DELEGATE', {
          task: 'ORDER_NOTE',
          itemId: 'ecg.12lead',
          patientId: 'p1',
          callId: null,
        }),
      ]);
      const task = run.state.ward.tasks[0];
      if (task?.mode !== 'INCOMPLETE' && task?.mode !== 'WRONG') continue;
      found = true;
      const done = advance(engine, run.state, 1200).state;
      expect(done.orders[task.orderId ?? '']?.status).toBe('FAILED');
      expect(done.ward.tasks[0]?.status).toBe('FAILED');
      expect(done.scoreLedger.map((l) => l.rule)).toContain('DELEGATION_FAILED');
    }
    expect(found).toBe(true);
  });

  it('入院新症委派：需要 ED_ADMISSION，完成後清除 tag 並標記流程', () => {
    let verified = false;
    for (let seed = 0; seed < 12 && !verified; seed++) {
      let state = engine.init(wardParams(`adm-${String(seed)}`, 'MO', 'HARD', 'DAY'));
      const hasTag = (s: GameState) =>
        Object.values(s.ward.tags).some((tags) => tags.includes('ED_ADMISSION'));
      for (let guard = 0; guard < 24 && !hasTag(state); guard++) {
        state = advance(engine, state, 1800).state;
      }
      const entry = Object.entries(state.ward.tags).find(([, tags]) =>
        tags.includes('ED_ADMISSION'),
      );
      if (!entry) continue;
      const patientId = entry[0];
      const run = feed(engine, state, [
        ward('DELEGATE', {
          task: 'ADMISSION',
          itemId: 'admission.workup',
          patientId,
          callId: null,
        }),
      ]);
      const task = run.state.ward.tasks.at(-1);
      if (task?.mode !== 'OK' && task?.mode !== 'DELAYED') continue;
      const done = advance(engine, run.state, 4000).state;
      expect(done.ward.tags[patientId] ?? []).not.toContain('ED_ADMISSION');
      expect(done.patients[patientId]?.hidden.fsm.flags).toContain('admission.workup');
      verified = true;
    }
    expect(verified).toBe(true);
  });

  it('委派簡單來電：成功時來電被處理（DELEGATED_OK）', () => {
    let tried = 0;
    for (let i = 0; i < 40 && tried === 0; i++) {
      let state = engine.init(wardParams(`dcall-${String(i)}`, 'MO'));
      state = injectCall(state, 'NURSE_ROUTINE', 'p1', { priority: 'ROUTINE', delegable: true });
      const callId = state.ward.calls[0]?.id ?? '';
      const run = feed(engine, state, [
        ward('DELEGATE', { task: 'SIMPLE_CALL', itemId: 'call.handle', patientId: 'p1', callId }),
      ]);
      expect(run.state.ward.calls[0]?.status).toBe('DELEGATED');
      const task = run.state.ward.tasks[0];
      if (task?.mode !== 'OK') continue;
      tried++;
      const done = advance(engine, run.state, 900).state;
      expect(done.ward.calls[0]).toMatchObject({ status: 'DONE', resolution: 'DELEGATED_OK' });
    }
    expect(tried).toBe(1);
  });
});

describe('移動同床邊', () => {
  it('唔喺床邊唔可以同病人對話（NOT_AT_BED）；去到床邊先可以', () => {
    const state = engine.init(wardParams('move-1'));
    const patient = patientsOf(state)[0];
    if (!patient) throw new Error('no patient');
    const blocked = feed(engine, state, [
      intentEvent({ type: 'SUBMIT_CHAT', patientId: patient.id, text: 'hi' }),
    ]);
    expect(blocked.effects.some((e) => e.type === 'NOTICE' && e.kind === 'NOT_AT_BED')).toBe(true);
    expect(blocked.state.chats[patient.id]?.lines).toHaveLength(0);
    const there = feed(engine, state, [ward('GO_TO_BED', { bed: patient.bed })]);
    const settled = advance(engine, there.state, 200).state;
    expect(settled.ward.location.bed).toBe(patient.bed);
    expect(settled.chats[patient.id]?.visits.at(-1)?.leftAt).toBeNull();
  });

  it('跨區行路要時間，同區即時', () => {
    let state = engine.init(wardParams('move-2', 'MO', 'HARD'));
    const a = patientsOf(state).find((p) => p.bed <= 10);
    const b = patientsOf(state).find((p) => p.bed > 10);
    if (!a || !b) return;
    state = feed(engine, state, [ward('GO_TO_BED', { bed: a.bed })]).state;
    expect(state.ward.location.bed).toBe(a.bed);
    state = feed(engine, state, [ward('GO_TO_BED', { bed: b.bed })]).state;
    expect(state.ward.location.bed).toBeNull();
    expect(state.ward.location.movingTo).toBe(b.bed);
    const moving = feed(engine, state, [ward('GO_TO_BED', { bed: a.bed })]);
    expect(moving.effects.some((e) => e.type === 'NOTICE' && e.kind === 'PLAYER_MOVING')).toBe(
      true,
    );
    state = advance(engine, state, 130).state;
    expect(state.ward.location.bed).toBe(b.bed);
  });
});

describe('確定性', () => {
  it('同 seed 同操作，一整更後 state 完全一致（含來電、委派）', () => {
    const run = () => {
      let state = engine.init(wardParams('det-1', 'MO', 'HARD', 'DAY'));
      state = feed(engine, state, [
        ward('DELEGATE', {
          task: 'ORDER_NOTE',
          itemId: 'ecg.12lead',
          patientId: 'p1',
          callId: null,
        }),
      ]).state;
      return JSON.stringify(advance(engine, state, 36000).state);
    };
    expect(run()).toBe(run());
  });
});

describe('wardCaseId：指定一個病人用某個 case 模板', () => {
  it('病房有指定模板嘅病人；未知 id 忽略；同 seed 決定性', () => {
    const forced = engine.init({ ...wardParams('forced'), wardCaseId: 'terminal-01' });
    const templates = Object.values(forced.patients).map((p) => p.hidden.caseTemplateId);
    expect(templates).toContain('terminal-01');
    const again = engine.init({ ...wardParams('forced'), wardCaseId: 'terminal-01' });
    expect(JSON.stringify(again)).toBe(JSON.stringify(forced));
    const unknown = engine.init({ ...wardParams('forced'), wardCaseId: 'no-such' });
    expect(Object.keys(unknown.patients)).toEqual(Object.keys(forced.patients));
  });
});
