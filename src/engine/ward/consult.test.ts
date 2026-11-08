import { describe, expect, it } from 'vitest';
import { getConfig } from '@/content';
import type { EngineEvent, Effect } from '../core/events';
import type { GameState, NewGameParams } from '../core/state';
import { advance, aiRequests, feed, intentEvent, realEngine, type Run } from '../test/realEngine';
import type { Call, Rank } from './wardTypes';

const engine = realEngine();
const config = getConfig();

const wardParams = (
  seed: string,
  playerRank: NewGameParams['playerRank'] = 'MO',
): NewGameParams => ({
  seed,
  mode: 'NIGHT',
  difficulty: 'MEDIUM',
  playerRank,
  ward: true,
});

const ward = (name: string, payload: Record<string, unknown>): EngineEvent =>
  intentEvent({ type: 'EXTENSION', module: 'ward', name, payload: payload as never });

const ITEMS = config.consult.items;
const idsOf = (part: 'S' | 'B' | 'A' | 'R') =>
  ITEMS.filter((i) => i.part === part).map((i) => i.id);
const ALL_PARTS = { S: idsOf('S'), B: idsOf('B'), A: idsOf('A'), R: idsOf('R') };
const NO_PARTS = { S: [], B: [], A: [], R: [] };

function prepared(seed: string, target: Rank = 'RES', rank: NewGameParams['playerRank'] = 'MO') {
  const state = engine.init(wardParams(seed, rank));
  const patient = Object.values(state.patients)[0];
  if (!patient) throw new Error('no patient');
  const next = feed(engine, state, [
    ward('PREPARE_CALL', { patientId: patient.id, target: { kind: 'RANK', rank: target } }),
  ]).state;
  return { state: next, patientId: patient.id };
}

const outgoing = (state: GameState): Call => {
  const call = state.ward.calls.find((c) => c.direction === 'OUT');
  if (!call) throw new Error('no outgoing call');
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

const rules = (state: GameState) => state.scoreLedger.map((l) => l.rule);
const failed = (state: GameState) => state.paused?.by === 'ai-failure';

const send = (state: GameState, sbar: Record<string, string>): Run =>
  feed(engine, state, [ward('SEND_CALL', { sbar })]);

const withEdit = (state: GameState, patch: Partial<Record<'S' | 'B' | 'A' | 'R', string>>) => ({
  ...(state.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' }),
  ...patch,
});

describe('consult：SBAR 清晰度由 engine 計', () => {
  it('冇改動預填 SBAR：唔需要 AI 理解，態度句由印象帶揀固定句', () => {
    const { state } = prepared('c-unedited');
    const run = send(state, state.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' });
    expect(aiRequests(run.effects)).toHaveLength(0);
    const call = outgoing(run.state);
    expect(call.exchange?.consult?.clarity).toBe(3);
    expect(call.outcome).toBe('BEDSIDE');
    expect(rules(run.state)).toContain('SBAR_GOOD');
    const line = call.lines.at(-1);
    expect(line?.speaker).toBe('CALLEE');
    expect(line?.template).toContain('{{consult.eta}}');
    expect(line?.tokenValues['consult.eta']).toMatch(/分鐘$/);
    expect(line?.template.replace(/\{\{[^}]+\}\}/g, '')).not.toMatch(/\d/);
  });

  it('改動後先要 AI 理解；prompt 帶清單，唔帶任何隱藏資料', () => {
    const { state } = prepared('c-edited');
    const run = send(state, withEdit(state, { R: '請你過嚟睇下。' }));
    const req = request(run, 'consult.assess');
    const context = req.context as {
      prompt: Record<string, unknown>;
      local: Record<string, unknown>;
    };
    expect(context.prompt.items).toHaveLength(ITEMS.length);
    expect(JSON.stringify(context.prompt)).not.toMatch(/hidden|fsm|caseTemplate|level/);
    expect(outgoing(run.state).exchange?.phase).toBe('ASSESSING');
  });

  it('AI 只報告覆蓋項目：clarity＝(齊咗幾段)−1；AI 自己填嘅 clarity 被忽略', () => {
    const { state } = prepared('c-clarity');
    const run0 = send(state, withEdit(state, { S: '氣促', B: '', A: '', R: '請過嚟' }));
    const run = answer(run0, 'consult.assess', {
      parts: { S: ['S.PROBLEM'], B: [], A: [], R: ['R.REQUEST'] },
      quoted: [],
      tone: 'NEUTRAL',
      clarity: 3,
      outcome: 'BEDSIDE',
    });
    const exchange = outgoing(run.state).exchange;
    expect(exchange?.consult?.clarity).toBe(1);
    expect(exchange?.phase).not.toBe('ASSESSING');
    expect(exchange?.reqId).toBeNull();
    expect(rules(run.state)).toContain('SBAR_POOR');
    expect(aiRequests(run.effects).some((r) => r.kind === 'consult.reply')).toBe(false);
  });

  it('四段都有覆蓋：clarity 3；對方追問冇覆蓋嘅項目', () => {
    const { state } = prepared('c-asks');
    const run0 = send(state, withEdit(state, { A: '我覺得好差' }));
    const run = answer(run0, 'consult.assess', {
      parts: { S: ['S.PROBLEM'], B: ['B.HISTORY'], A: ['A.IMPRESSION'], R: ['R.REQUEST'] },
      quoted: [],
      tone: 'POLITE',
    });
    const consult = outgoing(run.state).exchange?.consult;
    expect(consult?.clarity).toBe(3);
    expect(consult?.covered).toEqual(['S.PROBLEM', 'B.HISTORY', 'A.IMPRESSION', 'R.REQUEST']);
  });

  it('玩家引用嘅數值同真實讀數差太遠：算講錯，clarity 減 1，並扣 SBAR_INACCURATE', () => {
    const { state, patientId } = prepared('c-inaccurate');
    const spo2 = state.patients[patientId]?.visible.vitals.spo2 ?? 95;
    const wrong = spo2 > 70 ? spo2 - 20 : spo2 + 20;
    const run0 = send(state, withEdit(state, { A: `血氧 ${String(wrong)}` }));
    const run = answer(run0, 'consult.assess', {
      parts: { S: ['S.PROBLEM'], B: ['B.HISTORY'], A: ['A.VITALS'], R: ['R.REQUEST'] },
      quoted: [{ key: 'spo2', value: wrong }],
      tone: 'NEUTRAL',
    });
    const consult = outgoing(run.state).exchange?.consult;
    expect(consult?.inaccurate).toBe(true);
    expect(consult?.clarity).toBe(2);
    expect(rules(run.state)).toContain('SBAR_INACCURATE');
  });

  it('引用起草嗰刻嘅舊讀數唔算講錯', () => {
    const { state, patientId } = prepared('c-ref');
    const spo2 = state.patients[patientId]?.visible.vitals.spo2 ?? 95;
    const run0 = send(state, withEdit(state, { A: `血氧 ${String(spo2)}` }));
    const run = answer(run0, 'consult.assess', {
      parts: { S: ['S.PROBLEM'], B: ['B.HISTORY'], A: ['A.VITALS'], R: ['R.REQUEST'] },
      quoted: [{ key: 'spo2', value: spo2 }],
      tone: 'NEUTRAL',
    });
    expect(outgoing(run.state).exchange?.consult?.inaccurate).toBe(false);
  });

  it('語氣 RUDE 扣 SBAR_RUDE', () => {
    const { state } = prepared('c-rude');
    const run0 = send(state, withEdit(state, { R: '快啲啦！' }));
    const run = answer(run0, 'consult.assess', { parts: NO_PARTS, quoted: [], tone: 'RUDE' });
    expect(rules(run.state)).toContain('SBAR_RUDE');
  });
});

describe('consult：惡意或錯誤嘅 assess 結果一律當 AI 失敗', () => {
  const edited = (seed: string) => {
    const { state } = prepared(seed);
    return send(state, withEdit(state, { R: '請過嚟睇下，血氧 91。' }));
  };

  it('項目屬於錯嘅段落（injection：每段都報全部項目）', () => {
    const run = answer(edited('m-1'), 'consult.assess', {
      parts: ALL_PARTS.S.length > 0 ? { S: ITEMS.map((i) => i.id), B: [], A: [], R: [] } : NO_PARTS,
      quoted: [],
      tone: 'POLITE',
    });
    expect(failed(run.state)).toBe(true);
  });

  it('未知項目 id', () => {
    const run = answer(edited('m-2'), 'consult.assess', {
      parts: { ...NO_PARTS, R: ['R.EVERYTHING'] },
      quoted: [],
      tone: 'NEUTRAL',
    });
    expect(failed(run.state)).toBe(true);
  });

  it('虛構嘅數值（唔係玩家原文）', () => {
    const run = answer(edited('m-3'), 'consult.assess', {
      parts: { ...NO_PARTS, R: ['R.REQUEST'] },
      quoted: [{ key: 'spo2', value: 99 }],
      tone: 'NEUTRAL',
    });
    expect(failed(run.state)).toBe(true);
    expect(outgoing(run.state).exchange?.consult).toBeNull();
  });

  it('玩家冇寫嘅段落唔可以報覆蓋', () => {
    const { state } = prepared('m-4');
    const run0 = send(state, withEdit(state, { B: '', R: '請過嚟' }));
    const run = answer(run0, 'consult.assess', {
      parts: { ...NO_PARTS, B: ['B.HISTORY'] },
      quoted: [],
      tone: 'NEUTRAL',
    });
    expect(failed(run.state)).toBe(true);
  });

  it('格式唔啱（缺 parts）', () => {
    const run = answer(edited('m-5'), 'consult.assess', { tone: 'NEUTRAL' });
    expect(failed(run.state)).toBe(true);
  });
});

describe('consult：senior 回覆係固定句', () => {
  const afterAssess = (seed: string) => {
    const { state } = prepared(seed);
    const run0 = send(state, withEdit(state, { R: '請過嚟睇下。' }));
    return answer(run0, 'consult.assess', {
      parts: { S: ['S.PROBLEM'], B: ['B.HISTORY'], A: [], R: ['R.REQUEST'] },
      quoted: [],
      tone: 'NEUTRAL',
    });
  };

  it('印象帶揀句；到達時間凍結喺 token；模板冇裸數字', () => {
    const run = afterAssess('r-1');
    expect(aiRequests(run.effects).some((r) => r.kind === 'consult.reply')).toBe(false);
    expect(outgoing(run.state).outcome).toBe('BEDSIDE');
    const line = outgoing(run.state).lines.find((l) => l.template.includes('{{consult.eta}}'));
    expect(line?.template).toContain('{{consult.eta}}');
    expect(line?.tokenValues['consult.eta']).toMatch(/分鐘$/);
    expect(line?.template.replace(/\{\{[^}]+\}\}/g, '')).not.toMatch(/\d|肺炎|sepsis|mg/i);
    expect(failed(run.state)).toBe(false);
  });

  it('固定句唔會被事後的 AI 回覆改寫', () => {
    const run = afterAssess('r-3');
    const before = outgoing(run.state).lines.length;
    const out = feed(engine, run.state, [
      {
        type: 'AI_RESULT',
        reqId: 'no-such-reply',
        payload: { lines: [{ speaker: 'x', text: '血氧 99' }] },
      },
    ]);
    expect(outgoing(out.state).lines).toHaveLength(before);
    expect(failed(out.state)).toBe(false);
  });
});

describe('consult：跟進（雙向）', () => {
  const opened = (seed: string) => {
    const { state } = prepared(seed);
    const run = send(state, withEdit(state, { S: '氣促', B: '', A: '', R: '' }));
    return answer(run, 'consult.assess', {
      parts: { S: ['S.PROBLEM'], B: [], A: [], R: [] },
      quoted: [],
      tone: 'NEUTRAL',
    });
  };

  it('回覆後如果仲有追問，通話保持 OPEN；跟進會合併覆蓋並可以提升結果', () => {
    let run = opened('f-1');
    const first = outgoing(run.state);
    expect(first.exchange?.phase).toBe('OPEN');
    expect(first.outcome).toBe('REFUSE');
    expect(first.exchange?.consult?.asks.length).toBeGreaterThan(0);

    run = feed(engine, run.state, [
      ward('SEND_FOLLOWUP', { callId: first.id, text: '背景有高血壓，我請你過嚟睇，血氧 91。' }),
    ]);
    run = { ...run, effects: run.effects };
    const req = request(run, 'consult.assess');
    expect((req.context as { prompt: { mode: string } }).prompt.mode).toBe('FOLLOWUP');
    run = answer(run, 'consult.assess', {
      parts: { S: [], B: ['B.HISTORY'], A: ['A.VITALS'], R: ['R.REQUEST'] },
      quoted: [{ key: 'spo2', value: 91 }],
      tone: 'POLITE',
    });
    const consult = outgoing(run.state).exchange?.consult;
    expect(consult?.followups).toBe(1);
    expect(consult?.covered).toEqual(
      expect.arrayContaining(['S.PROBLEM', 'B.HISTORY', 'A.VITALS', 'R.REQUEST']),
    );
    expect(consult?.clarity).toBeGreaterThanOrEqual(2);
    expect(['ADVICE', 'BEDSIDE']).toContain(outgoing(run.state).outcome);
  });

  it('結果只會升唔會降；超過上限唔再接受跟進；OPEN 以外唔接受', () => {
    let run = opened('f-2');
    const id = outgoing(run.state).id;
    const bad = feed(engine, run.state, [ward('SEND_FOLLOWUP', { callId: 'nope', text: 'x' })]);
    expect(bad.effects.some((e: Effect) => e.type === 'NOTICE' && e.kind === 'CALL_UNKNOWN')).toBe(
      true,
    );
    for (let i = 0; i < config.consult.maxFollowups; i += 1) {
      run = feed(engine, run.state, [ward('SEND_FOLLOWUP', { callId: id, text: '再補充一下' })]);
      run = answer(run, 'consult.assess', { parts: NO_PARTS, quoted: [], tone: 'NEUTRAL' });
    }
    expect(outgoing(run.state).outcome).toBe('REFUSE');
    expect(outgoing(run.state).exchange?.phase).toBe('CLOSED');
    const extra = feed(engine, run.state, [ward('SEND_FOLLOWUP', { callId: id, text: '再補充' })]);
    expect(aiRequests(extra.effects)).toHaveLength(0);
    expect(
      extra.effects.some((e: Effect) => e.type === 'NOTICE' && e.kind === 'CALL_NOT_ACTIVE'),
    ).toBe(true);
  });

  it('掛線：通話結束', () => {
    const run = opened('f-3');
    const id = outgoing(run.state).id;
    const ended = feed(engine, run.state, [ward('END_CALL', { callId: id })]);
    expect(outgoing(ended.state).exchange?.phase).toBe('CLOSED');
  });

  it('跟進文字過長或者空白：拒絕', () => {
    const run = opened('f-4');
    const id = outgoing(run.state).id;
    const empty = feed(engine, run.state, [ward('SEND_FOLLOWUP', { callId: id, text: '   ' })]);
    expect(aiRequests(empty.effects)).toHaveLength(0);
    const long = feed(engine, run.state, [
      ward('SEND_FOLLOWUP', { callId: id, text: 'x'.repeat(config.consult.followupMaxChars + 1) }),
    ]);
    expect(aiRequests(long.effects)).toHaveLength(0);
  });
});

describe('consult：其他專科', () => {
  it('ICU 會診：AI 理解之後由 engine 按 MEWS 決定接收', () => {
    const state0 = engine.init(wardParams('d-icu'));
    const patient = Object.values(state0.patients)[0];
    let state = feed(engine, state0, [
      ward('PREPARE_CALL', {
        patientId: patient?.id ?? 'p1',
        target: { kind: 'DEPT', deptId: 'ICU' },
      }),
    ]).state;
    const run = send(state, state.ward.draft?.sbar ?? { S: '', B: '', A: '', R: '' });
    expect(outgoing(run.state).outcome).toBe('ICU_ASSESS');
    state = advance(engine, run.state, 1500).state;
    expect(['ICU_ACCEPT', 'ICU_DECLINE']).toContain(outgoing(state).outcome);
  });
});
