/** M3：spec §11 所有 order 種類都可以落；執行者（護士／下屬／玩家）；全部由 T4 驅動。 */
import { describe, expect, it } from 'vitest';
import { ORDER_TYPES } from '@/content/schema/m2Tables';
import { createEngine } from '../core/reducer';
import type { GameState } from '../core/state';
import {
  aiRequests,
  advance,
  feed,
  params,
  realConfig,
  realEngine,
  say,
  zeroNoiseTables,
} from '../test/realEngine';

const tables = zeroNoiseTables();
const engine = realEngine(tables);

const phraseFor = (row: (typeof tables)['order-catalog'][number]) => {
  const drug = tables.formulary.find((f) => f.catalogId === row.id);
  return drug
    ? `${drug.aliases[0] ?? drug.id} 1 ${drug.units[0] ?? 'g'} ${drug.routes[0] ?? ''}`
    : (row.aliases[0] ?? row.label);
};

const orderOf = (state: GameState, catalogId: string) =>
  Object.values(state.orders).find((o) => o.catalogId === catalogId);

describe('§11 全部 order 種類可落（T4）', () => {
  it('catalog 涵蓋每一種 order type（referral 屬 M4 會診系統，唔喺 M3 範圍）', () => {
    const types = new Set(tables['order-catalog'].map((r) => r.type));
    for (const type of ORDER_TYPES) expect(types.has(type), type).toBe(true);
  });

  it('每一行都可以用玩家打嘅句子落單，執行者喺 catalog 允許範圍內，全部標 PENDING_CLINICAL_REVIEW', () => {
    for (const row of tables['order-catalog']) {
      const run = feed(engine, engine.init(params(`place-${row.id}`)), [say(phraseFor(row))]);
      const order = orderOf(run.state, row.id);
      expect(order, row.id).toBeDefined();
      expect(row.executors as readonly string[], row.id).toContain(order?.executorKind);
      expect(['RUNNING', 'GATED'], row.id).toContain(order?.status);
      expect(row.reviewStatus, row.id).toBe('PENDING_CLINICAL_REVIEW');
    }
  });

  it('每個 order 都按表內固定時間完成（有 gate 嘅放行後起計）', () => {
    for (const row of tables['order-catalog']) {
      let run = feed(engine, engine.init(params(`dur-${row.id}`)), [say(phraseFor(row))]);
      const requests = aiRequests(run.effects).filter((r) => r.kind.startsWith('gate.'));
      run = feed(
        engine,
        run.state,
        requests.map((r) => ({
          type: 'AI_RESULT' as const,
          reqId: r.reqId,
          payload: { verdict: 'OK', concerns: [] },
        })),
      );
      const order = orderOf(run.state, row.id);
      expect(order?.status, row.id).toBe('RUNNING');
      expect((order?.completesAt ?? 0) - (order?.startsAt ?? 0), row.id).toBe(row.fixedDurationSec);
      const done = advance(engine, run.state, row.fixedDurationSec + 1).state;
      expect(orderOf(done, row.id)?.status, row.id).toBe('DONE');
    }
  });

  it('procedure：NG tube／Foley 可由護士、下屬、玩家做（快捷詞指定執行者）', () => {
    const cases: [string, string, string][] = [
      ['ng tube', 'proc.ngtube', 'NURSE'],
      ['ng tube myself', 'proc.ngtube', 'PLAYER'],
      ['ng tube sub', 'proc.ngtube', 'SUBORDINATE'],
      ['foley', 'proc.foley', 'NURSE'],
      ['foley self', 'proc.foley', 'PLAYER'],
      ['foley junior', 'proc.foley', 'SUBORDINATE'],
    ];
    for (const [text, catalogId, kind] of cases) {
      const run = feed(engine, engine.init(params(`proc-${text}`)), [say(text)]);
      expect(orderOf(run.state, catalogId)?.executorKind, text).toBe(kind);
    }
  });

  it('HO 冇下屬：指定下屬會改由護士做；執行者參考：player／sub', () => {
    const ho = engine.init({ ...params('ho'), playerRank: 'HO' });
    const run = feed(engine, ho, [say('foley junior')]);
    expect(orderOf(run.state, 'proc.foley')?.executorKind).toBe('NURSE');
    const self = feed(engine, ho, [say('foley self')]);
    expect(orderOf(self.state, 'proc.foley')?.executorKind).toBe('PLAYER');
    expect(orderOf(self.state, 'proc.foley')?.executor).toBe('player');
  });

  it('下屬速度倍數（T14 暫定）影響完成時間；玩家／護士唔受影響', () => {
    const config = realConfig();
    const slow = createEngine(
      {
        ...config,
        staff: { ...config.staff, speedMultiplier: { ...config.staff.speedMultiplier, NORMAL: 2 } },
      },
      { tables },
    );
    const sub = feed(slow, slow.init(params('speed')), [say('foley junior')]);
    const own = feed(slow, slow.init(params('speed')), [say('foley self')]);
    const order = orderOf(sub.state, 'proc.foley');
    expect((order?.completesAt ?? 0) - (order?.startsAt ?? 0)).toBe(1200);
    const mine = orderOf(own.state, 'proc.foley');
    expect((mine?.completesAt ?? 0) - (mine?.startsAt ?? 0)).toBe(600);
  });

  it('AI 解析可帶 executor；唔喺 catalog 允許名單嘅會被忽略', () => {
    const base = engine.init(params('ai-exec'));
    const asked = feed(engine, base, [say('幫我睇下可唔可以插個 cvc')]);
    const request = aiRequests(asked.effects)[0];
    const parse = (executor: string) =>
      feed(engine, asked.state, [
        {
          type: 'AI_RESULT',
          reqId: request?.reqId ?? '',
          payload: { intent: 'ORDER', actions: [{ catalogId: 'obs.vitals', executor }] },
        },
      ]);
    expect(orderOf(parse('PLAYER').state, 'obs.vitals')?.executorKind).toBe('NURSE');
    const lab = feed(engine, asked.state, [
      {
        type: 'AI_RESULT',
        reqId: request?.reqId ?? '',
        payload: { intent: 'ORDER', actions: [{ catalogId: 'lab.cbc', executor: 'PLAYER' }] },
      },
    ]);
    expect(orderOf(lab.state, 'lab.cbc')?.executorKind).toBe('PLAYER');
  });
});
