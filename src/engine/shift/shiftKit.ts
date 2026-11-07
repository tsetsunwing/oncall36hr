/** M6 測試輔助：用真 content 表驅動整更，自動回覆巡房 AI；其他 AI 請求留空（關閉自動暫停）。 */
import { gameSecondsPerRealMs } from '../core/clock';
import type { Effect, EngineEvent } from '../core/events';
import type { Engine } from '../core/reducer';
import type { GameState, NewGameParams } from '../core/state';
import { feed, fullTables, intentEvent, realConfig, type Run } from '../test/realEngine';
import { createEngine } from '../core/reducer';
import type { EngineTables } from '../case/tables';
import { shiftIntent } from './shiftModule';

export const kitConfig = realConfig();

export function kitEngine(overrides: Partial<EngineTables> = {}): Engine {
  return createEngine(kitConfig, { tables: { ...fullTables(), ...overrides } });
}

export const kitParams = (
  seed: string,
  mode: NewGameParams['mode'] = 'DAY',
  extra: Partial<NewGameParams> = {},
): NewGameParams => ({
  seed,
  mode,
  difficulty: 'MEDIUM',
  playerRank: 'MO',
  ward: true,
  ...extra,
});

export type RoundAnswerMode = 'question-only' | 'answer-correct';

interface AiRequest {
  reqId: string;
  kind: string;
  context: { prompt: { keyFacts?: { id: string }[]; hints?: string[] } };
}

function aiRequests(effects: readonly Effect[]): AiRequest[] {
  return effects.flatMap((e) => (e.type === 'AI_REQUEST' ? [e as unknown as AiRequest] : []));
}

/** 回覆所有巡房 AI 請求（題目：固定三個提示；評分：命中第一個 key fact） */
export function answerRoundAi(
  engine: Engine,
  run: Run,
  mode: RoundAnswerMode = 'question-only',
): Run {
  let state = run.state;
  const all = [...run.effects];
  let queue = aiRequests(run.effects).filter((r) => r.kind.startsWith('rounds.'));
  while (queue.length > 0) {
    const events = queue.flatMap((request): EngineEvent[] => {
      if (request.kind === 'rounds.question') {
        return [
          {
            type: 'AI_RESULT',
            reqId: request.reqId,
            payload: { question: '請講講呢位病人嘅重點', hints: ['提示甲', '提示乙', '提示丙'] },
          },
        ];
      }
      if (mode === 'question-only') return [];
      const id = request.context.prompt.keyFacts?.[0]?.id ?? '';
      return [
        {
          type: 'AI_RESULT',
          reqId: request.reqId,
          payload: { verdict: 'CORRECT', matchedKeyFacts: [id], seniorLine: '' },
        },
      ];
    });
    const step = feed(engine, state, events);
    state = step.state;
    all.push(...step.effects);
    queue = aiRequests(step.effects).filter((r) => r.kind.startsWith('rounds.'));
  }
  return { state, effects: all };
}

export interface DriveOptions {
  step?: number;
  mode?: RoundAnswerMode;
  /** 每個步進後呼叫；回傳 true 停止 */
  onStep?: (state: GameState, effects: readonly Effect[]) => boolean | undefined;
  /** 每步前可注入玩家動作 */
  act?: (state: GameState) => ReturnType<typeof intentEvent>[];
}

/** 前進 seconds 遊戲秒（1x），每步自動回覆巡房 AI；時鐘停咗（交更／結束）就提早返回 */
export function drive(
  engine: Engine,
  initial: GameState,
  seconds: number,
  options: DriveOptions = {},
): Run {
  const step = options.step ?? 60;
  let state = initial;
  const effects: Effect[] = [];
  let remaining = seconds;
  while (remaining > 0) {
    const rate = gameSecondsPerRealMs(engine.config, state);
    if (rate <= 0) break;
    const dt = Math.min(step, remaining);
    const actions = options.act?.(state) ?? [];
    const acted = feed(engine, state, actions);
    const ticked = feed(engine, acted.state, [{ type: 'TICK', dtRealMs: dt / rate }]);
    const run = answerRoundAi(
      engine,
      { state: ticked.state, effects: [...acted.effects, ...ticked.effects] },
      options.mode,
    );
    state = run.state;
    effects.push(...run.effects);
    remaining -= dt;
    if (options.onStep?.(state, run.effects) === true) break;
  }
  return { state, effects };
}

export const shiftAct = (name: string, payload: Record<string, unknown> = {}) =>
  intentEvent(shiftIntent(name, payload));
