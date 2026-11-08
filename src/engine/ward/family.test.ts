import { describe, expect, it } from 'vitest';
import { getConfig } from '@/content';
import { beginArrest } from '../acls/arrest';
import { beginDeath } from '../death/death';
import type { EngineEvent } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, NewGameParams } from '../core/state';
import { aiRequests, feed, intentEvent, realEngine, type Run } from '../test/realEngine';
import type { Call } from './wardTypes';

const engine = realEngine();
const config = getConfig();
const ctx: EngineContext = { config, tables: engine.tables };

const params = (seed: string, rank: NewGameParams['playerRank'] = 'MO'): NewGameParams => ({
  seed,
  mode: 'NIGHT',
  difficulty: 'MEDIUM',
  playerRank: rank,
  ward: true,
});

const ward = (name: string, payload: Record<string, unknown>): EngineEvent =>
  intentEvent({ type: 'EXTENSION', module: 'ward', name, payload: payload as never });
const death = (step: string): EngineEvent =>
  intentEvent({ type: 'EXTENSION', module: 'death', name: 'COMPLETE_STEP', payload: { step } });

function dead(seed: string, rank: NewGameParams['playerRank'] = 'MO') {
  const state = engine.init(params(seed, rank));
  const patient = Object.values(state.patients)[0];
  if (!patient) throw new Error('no patient');
  return { state: beginDeath(state, patient.id, ctx).state, patientId: patient.id };
}

const outgoing = (state: GameState, purpose: Call['purpose']): Call => {
  const call = state.ward.calls.find((c) => c.purpose === purpose);
  if (!call) throw new Error(`no ${purpose} call`);
  return call;
};

const request = (run: Run, kind: string) => {
  const found = aiRequests(run.effects).find((r) => r.kind === kind);
  if (!found) throw new Error(`no ${kind} request`);
  return found;
};

const answer = (run: Run, kind: string, payload: unknown): Run => {
  const req = request(run, kind);
  const result = feed(engine, run.state, [
    { type: 'AI_RESULT', reqId: req.reqId, payload: payload as never },
  ]);
  return { state: result.state, effects: [...run.effects, ...result.effects] };
};

const failed = (state: GameState) => state.paused?.by === 'ai-failure';
const rules = (state: GameState) => state.scoreLedger.map((l) => l.rule);

describe('死亡流程：通知上一級係真電話', () => {
  it('病房模式下按鈕式確認被拒絕；要由電話完成', () => {
    const { state } = dead('dc-gate');
    const run = feed(engine, state, [
      death('NOTIFY_SENIOR'),
      death('PHONE_FAMILY'),
      death('CERTIFICATE'),
    ]);
    expect(run.state.death?.steps.NOTIFY_SENIOR).toBeNull();
    expect(run.state.death?.steps.PHONE_FAMILY).toBeNull();
    expect(run.state.death?.steps.CERTIFICATE).not.toBeNull();
    expect(run.effects.some((e) => e.type === 'NOTICE' && e.kind === 'DEATH_STEP_VIA_PHONE')).toBe(
      true,
    );
  });

  it('單一病人（非病房）模式保留按鈕式確認', () => {
    const state = engine.init({ ...params('dc-legacy'), ward: false });
    const patient = Object.values(state.patients)[0];
    if (!patient) throw new Error('no patient');
    const run = feed(engine, beginDeath(state, patient.id, ctx).state, [death('NOTIFY_SENIOR')]);
    expect(run.state.death?.steps.NOTIFY_SENIOR).not.toBeNull();
  });

  it('SBAR 草稿預填死因同搶救摘要，目標係上一級；送出即完成該步並由 AI 措辭回覆', () => {
    const { state, patientId } = dead('dc-senior');
    let run = feed(engine, state, [ward('START_DEATH_CALL', { step: 'NOTIFY_SENIOR' })]);
    const draft = run.state.ward.draft;
    expect(draft?.purpose).toBe('DEATH_SENIOR');
    expect(draft?.target).toEqual({ kind: 'RANK', rank: 'RES' });
    expect(draft?.patientId).toBe(patientId);
    expect(draft?.sbar.B).toContain('死因');
    run = feed(engine, run.state, [ward('SEND_CALL', { sbar: draft?.sbar })]);
    expect(run.state.death?.steps.NOTIFY_SENIOR).not.toBeNull();
    const call = outgoing(run.state, 'DEATH_SENIOR');
    expect(call.outcome).toBe('DEATH_ACK');
    expect(aiRequests(run.effects)).toHaveLength(0);
    expect(call.exchange?.phase).toBe('CLOSED');
    expect(call.lines.at(-1)?.template).toBe('收到。');
    expect(call.lines.at(-1)?.template).not.toMatch(/\d/);
  });

  it('重複開始、冇死亡、已完成：拒絕', () => {
    const state = engine.init(params('dc-none'));
    const none = feed(engine, state, [ward('START_DEATH_CALL', { step: 'NOTIFY_SENIOR' })]);
    expect(none.state.ward.draft).toBeNull();
    const bad = feed(engine, dead('dc-bad').state, [
      ward('START_DEATH_CALL', { step: 'CERTIFICATE' }),
    ]);
    expect(bad.state.ward.draft).toBeNull();
  });
});

describe('死亡流程：致電家屬', () => {
  const started = (seed: string) => {
    const { state, patientId } = dead(seed);
    const run = feed(engine, state, [ward('START_DEATH_CALL', { step: 'PHONE_FAMILY' })]);
    return { run, patientId, call: outgoing(run.state, 'DEATH_FAMILY') };
  };

  it('開始：固定接聽句；階段 OPENING；未完成任何步驟', () => {
    const { run, call } = started('fam-start');
    expect(call.tag).toBe('FAMILY');
    expect(call.lines[0]?.speaker).toBe('CALLEE');
    expect(call.exchange?.family).toMatchObject({ stage: 'OPENING', turns: 0, informed: false });
    expect(run.state.death?.steps.PHONE_FAMILY).toBeNull();
  });

  it('預設講法「直接告知」：訊號由 T27 決定，唔使 AI 評估；PHONE_FAMILY 完成；家屬反應為 SHOCK／GRIEF 組合', () => {
    const { run, call } = started('fam-direct');
    const out = feed(engine, run.state, [
      ward('FAMILY_OPTION', { callId: call.id, optionId: 'direct' }),
    ]);
    expect(aiRequests(out.effects)).toHaveLength(0);
    expect(out.state.death?.steps.PHONE_FAMILY).not.toBeNull();
    const line = outgoing(out.state, 'DEATH_FAMILY').lines.at(-1);
    expect(line?.speaker).toBe('CALLEE');
    expect(line?.template).toContain('走咗');
    expect(line?.tokenValues['patient.name']).toBeTruthy();
    expect(outgoing(out.state, 'DEATH_FAMILY').exchange?.family?.stage).toBe('FOLLOWUP');
    expect(outgoing(out.state, 'DEATH_FAMILY').exchange?.phase).toBe('OPEN');
  });

  it('「溫和」講法同理心較高：反應為 GRIEF，並加 FAMILY_EMPATHIC；冷淡講法加 FAMILY_COLD', () => {
    const gentle = started('fam-gentle');
    const g = feed(engine, gentle.run.state, [
      ward('FAMILY_OPTION', { callId: gentle.call.id, optionId: 'gentle' }),
    ]);
    expect(rules(g.state)).toContain('FAMILY_EMPATHIC');
    expect(rules(g.state)).toContain('FAMILY_CLEAR');
    const cold = started('fam-cold');
    const c = feed(engine, cold.run.state, [
      ward('FAMILY_OPTION', { callId: cold.call.id, optionId: 'cold' }),
    ]);
    expect(rules(c.state)).toContain('FAMILY_COLD');
    expect(aiRequests(c.effects)).toHaveLength(0);
    expect(outgoing(c.state, 'DEATH_FAMILY').lines.at(-1)?.template).toContain('發生咗咩事');
  });

  it('含糊講法：未算已通知（PHONE_FAMILY 未完成），家屬困惑，FAMILY_VAGUE', () => {
    const { run, call } = started('fam-vague');
    const out = feed(engine, run.state, [
      ward('FAMILY_OPTION', { callId: call.id, optionId: 'vague' }),
    ]);
    expect(out.state.death?.steps.PHONE_FAMILY).toBeNull();
    expect(rules(out.state)).toContain('FAMILY_VAGUE');
    expect(rules(out.state)).not.toContain('FAMILY_COLD');
    expect(outgoing(out.state, 'DEATH_FAMILY').exchange?.family?.stage).toBe('OPENING');
  });

  it('自由輸入：AI 只抽訊號；engine 計分；惡意（矛盾訊號、未知訊號、錯格式）當 AI 失敗', () => {
    const { run, call } = started('fam-free');
    const typed = feed(engine, run.state, [
      ward('FAMILY_SAY', { callId: call.id, text: '我係值班醫生，病人搶救無效離世，我好遺憾。' }),
    ]);
    expect(request(typed, 'family.assess')).toBeDefined();
    expect(outgoing(typed.state, 'DEATH_FAMILY').exchange?.phase).toBe('ASSESSING');
    const ok = answer(typed, 'family.assess', {
      signals: ['STATES_DEATH', 'CONDOLENCE', 'EXPLAINS_EVENTS'],
      score: 10,
    });
    expect(ok.state.death?.steps.PHONE_FAMILY).not.toBeNull();
    expect(rules(ok.state)).toContain('FAMILY_EMPATHIC');
    for (const signals of [
      ['STATES_DEATH', 'CONDOLENCE', 'OFFERS_SUPPORT', 'EXPLAINS_EVENTS', 'BLUNT_OR_COLD'],
      ['STATES_DEATH', 'HINTS_SERIOUS'],
      ['FULL_MARKS'],
      ['CONDOLENCE', 'CONDOLENCE'],
    ]) {
      const bad = answer(typed, 'family.assess', { signals });
      expect(failed(bad.state), signals.join()).toBe(true);
      expect(bad.state.death?.steps.PHONE_FAMILY).toBeNull();
    }
    expect(failed(answer(typed, 'family.assess', { nothing: true }).state)).toBe(true);
  });

  it('家屬對白：預設選項唔叫模型；自由輸入先交 family.reply，裸數字、未授權 token、錯 speaker 全部拒絕', () => {
    const { run, call } = started('fam-reply');
    const preset = feed(engine, run.state, [
      ward('FAMILY_OPTION', { callId: call.id, optionId: 'direct' }),
    ]);
    expect(aiRequests(preset.effects)).toHaveLength(0);
    expect(outgoing(preset.state, 'DEATH_FAMILY').lines.at(-1)?.speaker).toBe('CALLEE');

    const typed = feed(engine, run.state, [
      ward('FAMILY_SAY', { callId: call.id, text: '病人搶救無效離世，我好遺憾。' }),
    ]);
    const out = answer(typed, 'family.assess', {
      signals: ['STATES_DEATH', 'CONDOLENCE', 'EXPLAINS_EVENTS'],
    });
    const speaker = (request(out, 'family.reply').context as { local: { speakerId: string } }).local
      .speakerId;
    for (const text of ['佢今年 86 歲㗎。', '床號係 {{vital.hr}}。', '我哋九十分鐘後到。']) {
      expect(failed(answer(out, 'family.reply', { lines: [{ speaker, text }] }).state), text).toBe(
        true,
      );
    }
    expect(
      failed(answer(out, 'family.reply', { lines: [{ speaker: 'doctor:x', text: '好。' }] }).state),
    ).toBe(true);
    const ok = answer(out, 'family.reply', {
      lines: [{ speaker, text: '點解會咁嘅……{{patient.name}}之前仲好好哋。' }],
    });
    const line = outgoing(ok.state, 'DEATH_FAMILY').lines.at(-1);
    expect(line?.speaker).toBe('CALLEE');
    expect(line?.tokenValues['patient.name']).toBeTruthy();
    expect(outgoing(ok.state, 'DEATH_FAMILY').exchange?.phase).toBe('OPEN');
  });

  it('回合上限後通話自動完結；掛線時已通知嘅家屬以固定收尾句結束', () => {
    let { run, call } = started('fam-turns');
    for (let turn = 0; turn < config.family.maxTurns; turn += 1) {
      run = feed(engine, run.state, [
        ward('FAMILY_OPTION', {
          callId: call.id,
          optionId: turn === 0 ? 'direct' : 'explain',
        }),
      ]);
      expect(aiRequests(run.effects).some((r) => r.kind === 'family.reply')).toBe(false);
      call = outgoing(run.state, 'DEATH_FAMILY');
    }
    expect(call.exchange?.phase).toBe('CLOSED');
    const extra = feed(engine, run.state, [
      ward('FAMILY_OPTION', { callId: call.id, optionId: 'visit' }),
    ]);
    expect(aiRequests(extra.effects)).toHaveLength(0);

    const fresh = started('fam-hangup');
    const informed = feed(engine, fresh.run.state, [
      ward('FAMILY_OPTION', { callId: fresh.call.id, optionId: 'direct' }),
    ]);
    const ended = feed(engine, informed.state, [ward('END_CALL', { callId: fresh.call.id })]);
    const last = outgoing(ended.state, 'DEATH_FAMILY');
    expect(last.exchange?.phase).toBe('CLOSED');
    expect(last.lines.at(-1)?.template).toBe(engine.tables['family-scenarios'][0]?.closing);
  });

  it('四步全部完成後床位釋放（病房模式）', () => {
    const { run, call, patientId } = started('fam-complete');
    let s = feed(engine, run.state, [
      ward('FAMILY_OPTION', { callId: call.id, optionId: 'direct' }),
      death('CERTIFICATE'),
      death('RECORD'),
      ward('START_DEATH_CALL', { step: 'NOTIFY_SENIOR' }),
    ]).state;
    s = feed(engine, s, [ward('SEND_CALL', { sbar: s.ward.draft?.sbar })]).state;
    expect(s.death?.status).toBe('COMPLETE');
    expect(s.death?.patientId).toBe(patientId);
  });
});

describe('心臟停頓時唔喺床邊：來電', () => {
  const arrested = (seed: string) => {
    const state = engine.init(params(seed));
    const patient = Object.values(state.patients).find((p) => p.bed !== state.ward.location.bed);
    if (!patient) throw new Error('no patient');
    const rhythm =
      engine.tables.rhythms.find((r) => r.id === 'VENTRICULAR_FIBRILLATION')?.id ??
      'VENTRICULAR_FIBRILLATION';
    const step = beginArrest(state, patient.id, rhythm, ctx, { rearrest: false });
    return { state: step.state, effects: step.effects, patient };
  };

  it('非床邊：護士打嚟，EMERGENCY、響鈴中，內容由模板同 token 組成', () => {
    const { state, patient, effects } = arrested('ar-call');
    const call = state.ward.calls.find((c) => c.templateId === 'ARREST_ALERT');
    expect(call).toBeDefined();
    expect(call?.priority).toBe('EMERGENCY');
    expect(call?.status).toBe('RINGING');
    expect(call?.patientId).toBe(patient.id);
    expect(call?.lines[0]?.tokenValues['patient.bed']).toBe(String(patient.bed));
    expect(effects.some((e) => e.type === 'NOTICE' && e.kind === 'CALL_RINGING')).toBe(true);
  });

  it('立即前往：用同一套來電回應，玩家移去該床', () => {
    const { state, patient } = arrested('ar-go');
    const call = state.ward.calls.find((c) => c.templateId === 'ARREST_ALERT');
    const run = feed(engine, state, [
      ward('RESPOND_CALL', { callId: call?.id, response: 'GO_NOW' }),
    ]);
    const after = run.state.ward;
    expect(after.calls.find((c) => c.id === call?.id)?.status).toBe('DONE');
    expect(after.location.bed === patient.bed || after.location.movingTo === patient.bed).toBe(
      true,
    );
  });

  it('自己行到該床：來電自動標記已到床邊，唔使再響亦唔扣漏接', () => {
    const { state, patient } = arrested('ar-arrive');
    const run = feed(engine, state, [ward('GO_TO_BED', { bed: patient.bed })]);
    const after = feed(engine, run.state, [{ type: 'TICK', dtRealMs: 120_000 }]).state;
    const call = after.ward.calls.find((c) => c.templateId === 'ARREST_ALERT');
    expect(call?.status).toBe('DONE');
    expect(call?.resolution).toBe('ATTENDED');
    expect(rules(after)).not.toContain('CALL_MISSED');
  });

  it('玩家已經喺床邊：唔會有來電', () => {
    const state = engine.init(params('ar-here'));
    const patient = Object.values(state.patients)[0];
    if (!patient) throw new Error('no patient');
    const here = feed(engine, state, [ward('GO_TO_BED', { bed: patient.bed })]);
    const arrivedState = feed(engine, here.state, [{ type: 'TICK', dtRealMs: 120_000 }]).state;
    expect(arrivedState.ward.location.bed).toBe(patient.bed);
    const rhythm = 'VENTRICULAR_FIBRILLATION';
    const step = beginArrest(arrivedState, patient.id, rhythm, ctx, { rearrest: false });
    expect(step.state.ward.calls.some((c) => c.templateId === 'ARREST_ALERT')).toBe(false);
  });
});
