import { describe, expect, it } from 'vitest';
import { appendLine, queueDialogue } from './dialogue';
import { advance, aiRequests, feed, params, realEngine, say } from '../test/realEngine';

describe('對白 context 固定大小', () => {
  it('完整對話留喺病人紀錄；模型只收到病人卡同最近兩句', () => {
    const engine = realEngine();
    let state = advance(
      engine,
      feed(engine, engine.init(params('card-1')), [say('oxygen nrb'), say('ns 500')]).state,
      120,
    ).state;
    for (let i = 0; i < 8; i += 1) {
      state = appendLine(state, {
        t: state.clock.t,
        patientId: 'p1',
        speaker: { kind: 'PLAYER', id: 'player' },
        template: `earlier ${String(i)}`,
        tokenValues: {},
        orderId: null,
      });
    }
    const queued = queueDialogue(
      state,
      {
        patientId: 'p1',
        beats: [{ type: 'ACK_CHAT', speaker: 'NURSE' }],
        tokens: {},
        addressed: [],
      },
      { config: engine.config, tables: engine.tables },
    );
    const request = aiRequests(queued?.effect ? [queued.effect] : [])[0];
    const prompt = request?.context.prompt as {
      recent: { template: string }[];
      card: { openOrders: { catalogId: string }[]; active: string[] };
    };
    expect(state.chats.p1?.lines.length).toBeGreaterThan(prompt.recent.length);
    expect(prompt.recent).toHaveLength(2);
    expect(prompt.recent.map((line) => line.template)).toEqual(['earlier 6', 'earlier 7']);
    expect(prompt.card.openOrders.some((order) => order.catalogId === 'fluid.ns500')).toBe(true);
    expect(prompt.card.active).toContain('oxygen.on');
    expect(prompt.card.openOrders[0]).toEqual({ id: 'o2', catalogId: 'fluid.ns500' });
  });
});
