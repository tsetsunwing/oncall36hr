import { describe, expect, it } from 'vitest';
import type { GameState } from '../core/state';
import { advance, feed, intentEvent, params, realEngine } from '../test/realEngine';

/** 把 p1 的清醒程度改成指定值，其餘不動。 */
function withConsciousness(state: GameState, consciousness: 'A' | 'V' | 'P' | 'U'): GameState {
  const patient = state.patients.p1;
  if (!patient) throw new Error('缺 p1');
  return {
    ...state,
    patients: {
      ...state.patients,
      p1: { ...patient, visible: { ...patient.visible, consciousness } },
    },
  };
}

describe('評估 GCS 由玩家按掣才更新', () => {
  const engine = realEngine();

  it('清醒病人評估後是滿分，瞳孔不變', () => {
    const state = withConsciousness(engine.init(params('gcs-a')), 'A');
    const before = state.patients.p1?.visible.neuro.pupils;
    const run = feed(engine, state, [intentEvent({ type: 'ASSESS_GCS', patientId: 'p1' })]);
    expect(run.state.patients.p1?.visible.neuro.gcs).toEqual({ e: 4, v: 5, m: 6 });
    expect(run.state.patients.p1?.visible.neuro.pupils).toEqual(before);
    expect(run.effects).toEqual([]);
  });

  it('對聲音有反應的病人評估後是 E3 V4 M5', () => {
    const state = withConsciousness(engine.init(params('gcs-v')), 'V');
    const run = feed(engine, state, [intentEvent({ type: 'ASSESS_GCS', patientId: 'p1' })]);
    expect(run.state.patients.p1?.visible.neuro.gcs).toEqual({ e: 3, v: 4, m: 5 });
  });

  it('病情轉差但未評估，GCS 停在舊分數', () => {
    const started = withConsciousness(engine.init(params('gcs-stale')), 'A');
    const assessed = feed(engine, started, [intentEvent({ type: 'ASSESS_GCS', patientId: 'p1' })]);
    const worsened = withConsciousness(assessed.state, 'P');
    const later = advance(engine, worsened, 600).state;
    expect(later.patients.p1?.visible.neuro.gcs).toEqual({ e: 4, v: 5, m: 6 });
    const reassessed = feed(engine, withConsciousness(later, 'P'), [
      intentEvent({ type: 'ASSESS_GCS', patientId: 'p1' }),
    ]);
    expect(reassessed.state.patients.p1?.visible.neuro.gcs).toEqual({ e: 2, v: 2, m: 4 });
  });

  it('評估不存在的病人只出提示，不改任何病人', () => {
    const state = engine.init(params('gcs-unknown'));
    const run = feed(engine, state, [intentEvent({ type: 'ASSESS_GCS', patientId: 'nope' })]);
    expect(run.state.patients).toEqual(state.patients);
    expect(run.effects.map((effect) => effect.type)).toEqual(['NOTICE']);
  });
});
