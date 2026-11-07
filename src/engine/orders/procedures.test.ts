import { describe, expect, it } from 'vitest';
import { advance, answerGates, feed, params, realEngine, say } from '../test/realEngine';

const PROCEDURES: [string, string, string][] = [
  ['ng tube sub', 'proc.ngtube', 'ngt.in'],
  ['foley sub', 'proc.foley', 'foley.in'],
  ['ng tube myself', 'proc.ngtube', 'ngt.in'],
  ['foley myself', 'proc.foley', 'foley.in'],
  ['intubation', 'proc.intubation', 'airway.secured'],
  ['chest tube', 'proc.chesttube', 'chesttube.in'],
  ['cvc', 'proc.cvc', 'cvc.in'],
  ['needle decompression', 'proc.decompression', 'decompression.done'],
  ['pericardiocentesis', 'proc.pericardiocentesis', 'pericardiocentesis.done'],
  ['rewarm', 'proc.rewarm', 'rewarm.on'],
];

describe('spec §11 程序 order 流程可以完整走完', () => {
  const engine = realEngine();
  it.each(PROCEDURES)('%s → 完成並設定 flag', (text, catalogId, flag) => {
    const run = answerGates(engine, feed(engine, engine.init(params('proc-1')), [say(text)]));
    const state = advance(engine, run.state, 3600).state;
    const orders = Object.values(state.orders).filter((o) => o.catalogId === catalogId);
    expect(orders.length, text).toBeGreaterThanOrEqual(1);
    expect(
      orders.every((o) => o.status === 'DONE'),
      text,
    ).toBe(true);
    expect(state.patients.p1?.hidden.fsm.flags, text).toContain(flag);
  });

  it('NG tube／Foley 可由玩家、下屬或護士執行，執行者記錄喺 order', () => {
    const run = (text: string) => {
      const r = answerGates(engine, feed(engine, engine.init(params('proc-2')), [say(text)]));
      return Object.values(advance(engine, r.state, 3600).state.orders)[0];
    };
    expect(run('ng tube sub')?.executorKind).toBe('SUBORDINATE');
    expect(run('ng tube myself')?.executorKind).toBe('PLAYER');
    expect(run('foley sub')?.executorKind).toBe('SUBORDINATE');
    expect(run('foley myself')?.executorKind).toBe('PLAYER');
  });
});
