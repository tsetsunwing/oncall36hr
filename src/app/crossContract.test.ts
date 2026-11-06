/**
 * engine 同 ai 係兩個互不 import 嘅層：呢度（組裝根）驗證兩邊對契約嘅理解一致。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkDialogueText, contractFor, DIALOGUE_KIND, ORDER_PARSE_KIND } from '@/ai';
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
