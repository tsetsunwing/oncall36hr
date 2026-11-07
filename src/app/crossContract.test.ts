/**
 * engine 同 ai 係兩個互不 import 嘅層：呢度（組裝根）驗證兩邊對契約嘅理解一致。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkDialogueText,
  CONSULT_ASSESS_KIND,
  CONSULT_REPLY_KIND,
  contractFor,
  DIALOGUE_KIND,
  FAMILY_ASSESS_KIND,
  FAMILY_REPLY_KIND,
  ORDER_PARSE_KIND,
} from '@/ai';
import { getConfig, getContent } from '@/content';
import {
  createEngine,
  hasBareNumber,
  leaksDiagnosis,
  validateTemplate,
  type Effect,
  type EngineEvent,
  type GameState,
} from '@/engine';

const engine = createEngine(getConfig(), { tables: getContent().tables });

function collectRequests() {
  const requests: Extract<Effect, { type: 'AI_REQUEST' }>[] = [];
  let state: GameState = engine.init({
    seed: 'cross-1',
    mode: 'NIGHT',
    difficulty: 'MEDIUM',
    playerRank: 'MO',
  });
  const step = (event: EngineEvent) => {
    const result = engine.reduce(state, event);
    state = result.state;
    for (const effect of result.effects) if (effect.type === 'AI_REQUEST') requests.push(effect);
    return result;
  };
  const say = (text: string) =>
    step({ type: 'PLAYER_INTENT', intent: { type: 'SUBMIT_CHAT', patientId: 'p1', text } });
  const parsed = (payload: unknown) => {
    const pending = [...state.pendingAi].reverse().find((p) => p.kind === ORDER_PARSE_KIND);
    if (!pending) throw new Error('冇 order.parse pending');
    step({ type: 'AI_RESULT', reqId: pending.reqId, payload: payload as never });
  };
  const tick = (gameSeconds: number) => {
    step({ type: 'TICK', dtRealMs: (gameSeconds / 30) * 1000 });
  };
  return { requests, say, parsed, tick, state: () => state };
}

describe('engine 發出嘅每個 AI context 都符合 ai 契約', () => {
  it('涵蓋所有 beat 類型同 order.parse', () => {
    const run = collectRequests();
    run.say('oxygen nrb');
    run.say('check vitals');
    run.tick(300);
    run.say('隨便講啲嘢');
    run.parsed({ intent: 'UNCLEAR' });
    run.say('唔該晒');
    run.parsed({ intent: 'CHAT', addressee: { kind: 'nurse' } });
    run.say('@黃國強 你點呀');
    run.parsed({ intent: 'QUESTION', addressee: { kind: 'patient' } });
    run.say('而家點呀');
    run.parsed({ intent: 'QUESTION' });
    run.say('叫醫生嚟');
    run.parsed({ intent: 'DELEGATE' });
    run.say('ns 500');
    run.say('取消生理鹽水');
    const nsOrder = Object.values(run.state().orders).find((o) => o.catalogId === 'fluid.ns500');
    run.parsed({ intent: 'CANCEL', cancelTargets: [nsOrder?.id ?? ''] });
    run.tick(3600);

    const beats = new Set<string>();
    expect(run.requests.length).toBeGreaterThan(8);
    for (const request of run.requests) {
      const contract = contractFor(request.kind);
      expect(contract, request.kind).toBeDefined();
      const context = request.context as { prompt: unknown; local: unknown };
      const prompt = contract?.promptSchema.safeParse(context.prompt);
      const local = contract?.localSchema.safeParse(context.local);
      expect(prompt?.success, JSON.stringify(prompt?.error?.issues)).toBe(true);
      expect(local?.success, JSON.stringify(local?.error?.issues)).toBe(true);
      if (request.kind === DIALOGUE_KIND) {
        for (const beat of (context.prompt as { beats: { type: string }[] }).beats) {
          beats.add(beat.type);
        }
      }
    }
    expect([...beats].sort()).toEqual(
      [
        'ACK_CHAT',
        'ACK_ORDER',
        'ALERT_DETERIORATION',
        'ASK_REPHRASE',
        'ORDER_CANCELLED',
        'PATIENT_SPEAKS',
        'REPORT_RESULT',
        'REPORT_STATUS',
      ].sort(),
    );
  });

  it('prompt 內嘅 allowedTokens ＝ local 凍結 token 嘅 key；beat 引用嘅 token 全部喺內', () => {
    const run = collectRequests();
    run.say('check vitals');
    run.tick(600);
    for (const request of run.requests.filter((r) => r.kind === DIALOGUE_KIND)) {
      const { prompt, local } = request.context as {
        prompt: { allowedTokens: string[]; beats: { tokens?: string[]; labelToken?: string }[] };
        local: { frozenTokens: Record<string, string>; allowedTokens: string[] };
      };
      expect(new Set(prompt.allowedTokens)).toEqual(new Set(Object.keys(local.frozenTokens)));
      expect(local.allowedTokens).toEqual(prompt.allowedTokens);
      for (const beat of prompt.beats) {
        for (const token of [
          ...(beat.tokens ?? []),
          ...(beat.labelToken ? [beat.labelToken] : []),
        ]) {
          expect(prompt.allowedTokens).toContain(token);
        }
      }
    }
  });

  it('order.parse 嘅 prompt 唔含診斷詞（deny-list 只留喺本機）', () => {
    const run = collectRequests();
    run.say('隨便');
    const request = run.requests.find((r) => r.kind === ORDER_PARSE_KIND);
    const sent = JSON.stringify((request?.context as { prompt: unknown }).prompt).toLowerCase();
    const template = getContent().tables['case-templates'][0];
    for (const term of template?.diagnosisTerms ?? []) {
      expect(sent).not.toContain(term.toLowerCase());
    }
  });
});

describe('numeric guard：engine 同 ai 兩份規則一致', () => {
  const allowed = ['vital.hr', 'vital.spo2', 'order.1.label'];
  const corpus = [
    '血氧 {{vital.spo2}}%',
    '血氧 93',
    '血氧九十三',
    '三十八度',
    '一下',
    '兩個',
    '{{vital.nope}}',
    '{{vital.spo2}',
    '',
    '   ',
    '好'.repeat(200),
    '全形１２３',
    '羅馬數字 Ⅻ',
    '上標 ²',
    '百分之九十',
    '心跳 {{vital.hr}}，血氧 {{vital.spo2}}，{{order.1.label}}',
  ];

  const agree = (text: string) => {
    const engineOk = validateTemplate(text, new Set(allowed), 140) === null;
    const aiOk =
      checkDialogueText(text, { allowedTokens: new Set(allowed), denyTerms: [], maxChars: 140 })
        .length === 0;
    return { engineOk, aiOk };
  };

  it.each(corpus)('%s', (text) => {
    const { engineOk, aiOk } = agree(text);
    expect(aiOk).toBe(engineOk);
  });

  it('隨機字串：兩邊判斷一致', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ maxLength: 6 }),
            fc.constantFrom(
              '{{vital.hr}}',
              '{{vital.x}}',
              '九十',
              '十',
              '一',
              '度',
              '％',
              '３',
              '{{',
              '}}',
            ),
          ),
          { maxLength: 8 },
        ),
        (parts) => {
          const text = parts.join('');
          const { engineOk, aiOk } = agree(text);
          expect(aiOk).toBe(engineOk);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('數字偵測同診斷偵測同步', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), (text) => {
        expect(hasBareNumber(text)).toBe(
          checkDialogueText(text, {
            allowedTokens: new Set(),
            denyTerms: [],
            maxChars: 9999,
          }).includes('BARE_NUMBER'),
        );
      }),
      { numRuns: 200 },
    );
    expect(leaksDiagnosis('肺炎', ['肺炎'])).toBe(true);
  });
});

describe('M4b：consult／family 契約同 engine 一致', () => {
  const wardEngine = engine;

  function wardRun() {
    const requests: Extract<Effect, { type: 'AI_REQUEST' }>[] = [];
    let state: GameState = wardEngine.init({
      seed: 'cross-ward',
      mode: 'NIGHT',
      difficulty: 'MEDIUM',
      playerRank: 'MO',
      ward: true,
    });
    const step = (event: EngineEvent) => {
      const result = wardEngine.reduce(state, event);
      state = result.state;
      for (const effect of result.effects) if (effect.type === 'AI_REQUEST') requests.push(effect);
    };
    const ward = (name: string, payload: unknown) => {
      step({
        type: 'PLAYER_INTENT',
        intent: { type: 'EXTENSION', module: 'ward', name, payload: payload as never },
      });
    };
    const answer = (kind: string, payload: unknown) => {
      const pending = [...state.pendingAi].reverse().find((p) => p.kind === kind);
      if (!pending) throw new Error(`冇 ${kind} pending`);
      step({ type: 'AI_RESULT', reqId: pending.reqId, payload: payload as never });
    };
    const setState = (next: GameState) => {
      state = next;
    };
    return { requests, ward, answer, state: () => state, step, setState };
  }

  const speakerOf = (run: ReturnType<typeof wardRun>, kind: string) => {
    const req = [...run.requests].reverse().find((r) => r.kind === kind);
    return (req?.context as { local: { speakerId: string } }).local.speakerId;
  };

  it('engine 發出嘅四種新 context 全部通過各自契約嘅 prompt／local schema', () => {
    const run = wardRun();
    const patientId = Object.keys(run.state().patients)[0] ?? 'p1';
    run.ward('PREPARE_CALL', { patientId, target: { kind: 'RANK', rank: 'RES' } });
    const draft = run.state().ward.draft;
    run.ward('SEND_CALL', { sbar: { ...draft?.sbar, R: '請過嚟睇下。' } });
    run.answer(CONSULT_ASSESS_KIND, {
      parts: { S: ['S.PROBLEM'], B: [], A: [], R: ['R.REQUEST'] },
      quoted: [],
      tone: 'NEUTRAL',
    });
    run.answer(CONSULT_REPLY_KIND, {
      lines: [{ speaker: speakerOf(run, CONSULT_REPLY_KIND), text: '再講多啲。' }],
    });
    const callId = run.state().ward.calls.find((c) => c.direction === 'OUT')?.id ?? '';
    run.ward('SEND_FOLLOWUP', { callId, text: '背景有高血壓' });

    const state = run.state();
    run.setState({
      ...state,
      death: {
        patientId,
        diedAt: state.clock.t,
        status: 'PENDING_PROCESS',
        steps: { CERTIFICATE: null, NOTIFY_SENIOR: null, PHONE_FAMILY: null, RECORD: null },
        seniorRank: 'RES',
        delayCharges: 0,
        completedAt: null,
        summary: { cycles: 2, shocks: 1, drugs: 1 },
      },
    });
    run.ward('START_DEATH_CALL', { step: 'PHONE_FAMILY' });
    const family = run.state().ward.calls.find((c) => c.purpose === 'DEATH_FAMILY')?.id ?? '';
    run.ward('FAMILY_SAY', { callId: family, text: '我好遺憾，病人離世。' });
    run.answer(FAMILY_ASSESS_KIND, { signals: ['STATES_DEATH', 'CONDOLENCE'] });

    const kinds = new Set(run.requests.map((r) => r.kind));
    for (const kind of [
      CONSULT_ASSESS_KIND,
      CONSULT_REPLY_KIND,
      FAMILY_ASSESS_KIND,
      FAMILY_REPLY_KIND,
    ]) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    for (const request of run.requests) {
      const contract = contractFor(request.kind);
      const context = request.context as { prompt: unknown; local: unknown };
      const prompt = contract?.promptSchema.safeParse(context.prompt);
      const local = contract?.localSchema.safeParse(context.local);
      expect(prompt?.success, `${request.kind} ${JSON.stringify(prompt?.error?.issues)}`).toBe(
        true,
      );
      expect(local?.success, `${request.kind} ${JSON.stringify(local?.error?.issues)}`).toBe(true);
    }
    expect(speakerOf(run, FAMILY_REPLY_KIND)).toMatch(/^callee:/);
  });

  const assessCases: { name: string; payload: unknown }[] = [
    {
      name: '合法',
      payload: {
        parts: { S: ['S.PROBLEM'], B: [], A: [], R: ['R.REQUEST'] },
        quoted: [{ key: 'spo2', value: 91 }],
        tone: 'NEUTRAL',
      },
    },
    {
      name: '錯段',
      payload: { parts: { S: ['R.REQUEST'], B: [], A: [], R: [] }, quoted: [], tone: 'NEUTRAL' },
    },
    {
      name: '虛構數值',
      payload: {
        parts: { S: [], B: [], A: [], R: [] },
        quoted: [{ key: 'spo2', value: 77 }],
        tone: 'NEUTRAL',
      },
    },
    {
      name: '未知項目',
      payload: { parts: { S: [], B: [], A: [], R: ['R.X'] }, quoted: [], tone: 'NEUTRAL' },
    },
    {
      name: '空段落報覆蓋',
      payload: { parts: { S: [], B: ['B.HISTORY'], A: [], R: [] }, quoted: [], tone: 'NEUTRAL' },
    },
  ];

  it.each(assessCases)('consult.assess：ai guard 同 engine 判斷一致（$name）', ({ payload }) => {
    const run = wardRun();
    const patientId = Object.keys(run.state().patients)[0] ?? 'p1';
    run.ward('PREPARE_CALL', { patientId, target: { kind: 'RANK', rank: 'RES' } });
    const sbar = { S: '氣促', B: '', A: '', R: '請過嚟，血氧 91' };
    run.ward('SEND_CALL', { sbar });
    const request = run.requests.find((r) => r.kind === CONSULT_ASSESS_KIND);
    const contract = contractFor(CONSULT_ASSESS_KIND);
    const { prompt, local } = request?.context as { prompt: unknown; local: unknown };
    const parsed = contract?.dataSchema.safeParse(payload);
    const aiOk =
      parsed?.success === true &&
      contract?.guard(
        parsed.data,
        contract.promptSchema.parse(prompt),
        contract.localSchema.parse(local),
      ).issues.length === 0;
    run.answer(CONSULT_ASSESS_KIND, payload);
    const engineOk = run.state().paused?.by !== 'ai-failure';
    expect(aiOk).toBe(engineOk);
  });

  it('family.assess：ai guard 同 engine 對矛盾訊號判斷一致', () => {
    const contract = contractFor(FAMILY_ASSESS_KIND);
    const combos = [
      ['STATES_DEATH', 'CONDOLENCE'],
      ['BLUNT_OR_COLD', 'CONDOLENCE'],
      ['STATES_DEATH', 'HINTS_SERIOUS'],
      ['CONDOLENCE', 'CONDOLENCE'],
      ['HINTS_SERIOUS', 'JARGON'],
      [
        'STATES_DEATH',
        'CONDOLENCE',
        'OFFERS_SUPPORT',
        'EXPLAINS_EVENTS',
        'BLUNT_OR_COLD',
        'JARGON',
      ],
    ];
    for (const signals of combos) {
      const run = wardRun();
      const patientId = Object.keys(run.state().patients)[0] ?? 'p1';
      const state = run.state();
      run.setState({
        ...state,
        death: {
          patientId,
          diedAt: 0,
          status: 'PENDING_PROCESS',
          steps: { CERTIFICATE: null, NOTIFY_SENIOR: null, PHONE_FAMILY: null, RECORD: null },
          seniorRank: 'RES',
          delayCharges: 0,
          completedAt: null,
          summary: { cycles: 1, shocks: 0, drugs: 0 },
        },
      });
      run.ward('START_DEATH_CALL', { step: 'PHONE_FAMILY' });
      const callId = run.state().ward.calls.find((c) => c.purpose === 'DEATH_FAMILY')?.id ?? '';
      run.ward('FAMILY_SAY', { callId, text: '我係醫生' });
      const request = run.requests.find((r) => r.kind === FAMILY_ASSESS_KIND);
      const { prompt, local } = request?.context as { prompt: unknown; local: unknown };
      const parsed = contract?.dataSchema.safeParse({ signals });
      const aiOk =
        parsed?.success === true &&
        contract?.guard(
          parsed.data,
          contract.promptSchema.parse(prompt),
          contract.localSchema.parse(local),
        ).issues.length === 0;
      run.answer(FAMILY_ASSESS_KIND, { signals });
      expect(aiOk, signals.join()).toBe(run.state().paused?.by !== 'ai-failure');
    }
  });

  it('callee reply：對白文字兩邊判斷一致（裸數字、token、診斷、speaker）', () => {
    const texts = [
      '收到，我 {{consult.eta}} 內過嚟。',
      '血氧 99',
      '{{vital.secret}}',
      '九十分鐘',
      '好。',
    ];
    for (const text of texts) {
      const run = wardRun();
      const patientId = Object.keys(run.state().patients)[0] ?? 'p1';
      run.ward('PREPARE_CALL', { patientId, target: { kind: 'RANK', rank: 'RES' } });
      run.ward('SEND_CALL', { sbar: run.state().ward.draft?.sbar });
      const request = run.requests.find((r) => r.kind === CONSULT_REPLY_KIND);
      const contract = contractFor(CONSULT_REPLY_KIND);
      const { prompt, local } = request?.context as {
        prompt: unknown;
        local: { speakerId: string };
      };
      const data = { lines: [{ speaker: local.speakerId, text }] };
      const aiOk =
        contract?.guard(
          contract.dataSchema.parse(data),
          contract.promptSchema.parse(prompt),
          contract.localSchema.parse(local),
        ).issues.length === 0;
      run.answer(CONSULT_REPLY_KIND, data);
      expect(aiOk, text).toBe(run.state().paused?.by !== 'ai-failure');
    }
  });
});
