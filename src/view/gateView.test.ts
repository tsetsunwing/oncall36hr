import { describe, expect, it } from 'vitest';
import { getConfig, getContent } from '@/content';
import { createEngine, type EngineEvent, type GameState } from '@/engine';
import { selectGameView, type ViewEnv } from './gameView';

const baseConfig = getConfig();
const config = { ...baseConfig, clock: { ...baseConfig.clock, pauseWhileAiPending: false } };
const tables = getContent().tables;
const engine = createEngine(config, { tables });
const env: ViewEnv = { tables, config };

const say = (text: string): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent: { type: 'SUBMIT_CHAT', patientId: 'p1', text },
});

function run(state: GameState, events: EngineEvent[]): GameState {
  return events.reduce((s, e) => engine.reduce(s, e).state, state);
}

function gatedAugmentin(): GameState {
  const placed = engine.reduce(
    engine.init({ seed: 'gv-1', mode: 'NIGHT', difficulty: 'MEDIUM', playerRank: 'MO' }),
    say('augmentin 1.2 g iv'),
  );
  const requests = placed.effects.flatMap((e) => (e.type === 'AI_REQUEST' ? [e] : []));
  const concern = {
    category: 'ALLERGY',
    line: '病人對 {{patient.allergies}} 過敏，{{order.label}} 有風險。',
  };
  return run(
    placed.state,
    requests.map((r) => ({
      type: 'AI_RESULT' as const,
      reqId: r.reqId,
      payload: { verdict: r.kind === 'gate.pharmacy' ? 'OBJECT' : 'CONFIRM', concerns: [concern] },
    })),
  );
}

describe('把關 ViewModel', () => {
  it('審視中：gate 卡 phase=REVIEW、冇關注、唔可堅持；order 狀態 GATED 且可取消', () => {
    const placed = engine.reduce(
      engine.init({ seed: 'gv-0', mode: 'NIGHT', difficulty: 'MEDIUM', playerRank: 'MO' }),
      say('augmentin 1.2 g iv'),
    );
    const view = selectGameView(placed.state, env);
    expect(view.gates).toHaveLength(1);
    expect(view.gates[0]).toMatchObject({ phase: 'REVIEW', concerns: [], canInsist: false });
    expect(view.orders[0]).toMatchObject({ status: 'GATED', cancellable: true, etaSeconds: null });
  });

  it('決定點：關注句子已用凍結 token 解析；藥房名來自 config，護士名來自在場人員', () => {
    const view = selectGameView(gatedAugmentin(), env);
    const [card] = view.gates;
    expect(card).toMatchObject({ phase: 'DECISION', required: 2, insistCount: 0, canInsist: true });
    expect(card?.concerns.map((c) => c.byName).sort()).toEqual(
      ['何姑娘', config.gate.pharmacyName].sort(),
    );
    for (const concern of card?.concerns ?? []) {
      expect(concern.text).toContain('Penicillin');
      expect(concern.text).not.toMatch(/\{\{|\}\}/);
    }
  });

  it('藥房對白出現喺 chat，kind=PHARMACY、source=PHONE、speakerName 來自 config', () => {
    const lines = selectGameView(gatedAugmentin(), env).chat?.lines ?? [];
    const pharmacy = lines.find((l) => l.kind === 'PHARMACY');
    expect(pharmacy).toMatchObject({ source: 'PHONE', speakerName: config.gate.pharmacyName });
    expect(lines.filter((l) => l.kind === 'NURSE').every((l) => l.source === 'BEDSIDE')).toBe(true);
  });

  it('gate 資料唔洩露診斷、danger 評級細節、擲骰值或後果', () => {
    let state = gatedAugmentin();
    const id = Object.values(state.orders)[0]?.id ?? '';
    state = run(state, [
      { type: 'PLAYER_INTENT', intent: { type: 'INSIST_ORDER', orderId: id } },
      { type: 'PLAYER_INTENT', intent: { type: 'INSIST_ORDER', orderId: id } },
    ]);
    const json = JSON.stringify(selectGameView(state, env));
    for (const secret of [
      '"roll"',
      'rolled',
      'danger',
      'rationale',
      'safety',
      'activeEffects',
      'consequence',
    ]) {
      expect(json, secret).not.toContain(secret);
    }
  });

  it('化驗報告：由 patient.visible.reports 映射，帶 H／L、佔位提示；行動記錄有結果摘要', () => {
    let state = run(
      engine.init({ seed: 'gv-2', mode: 'NIGHT', difficulty: 'MEDIUM', playerRank: 'MO' }),
      [say('cbc')],
    );
    state = run(state, [{ type: 'TICK', dtRealMs: (3000 / 12) * 1000 }]);
    const view = selectGameView(state, env);
    const [report] = view.reports;
    expect(report).toMatchObject({ kind: 'PANEL', reviewPending: true });
    expect(report?.items.length).toBeGreaterThan(0);
    expect(view.orders[0]).toMatchObject({ resultStatus: 'REPORTED', executorKind: 'NURSE' });
    expect(view.actionLog.patient.find((r) => r.kind === 'ORDER')?.resultText).toContain(
      report?.items[0]?.label ?? '?',
    );
  });

  it('cancel 後 gate 卡消失；order 顯示已取消', () => {
    let state = gatedAugmentin();
    const id = Object.values(state.orders)[0]?.id ?? '';
    state = run(state, [{ type: 'PLAYER_INTENT', intent: { type: 'CANCEL_ORDER', orderId: id } }]);
    const view = selectGameView(state, env);
    expect(view.gates).toEqual([]);
    expect(view.orders[0]).toMatchObject({ status: 'CANCELLED', cancellable: false });
  });
});
