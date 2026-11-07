/** ACLS／死亡流程測試用嘅小工具：用真 content 表同真 engine，按指令字串落 order。 */
import { getConfig } from '@/content';
import { gameSecondsPerRealMs } from '../core/clock';
import type { Effect } from '../core/events';
import type { Engine } from '../core/reducer';
import type { GameState } from '../core/state';
import {
  advance,
  aiRequests,
  answerGates,
  feed,
  intentEvent,
  params,
  realEngine,
  say,
  type Run,
} from '../test/realEngine';

export const config = getConfig();

export type AiMode = 'ignore' | 'cheerful';

export interface Session {
  engine: Engine;
  state: GameState;
  effects: Effect[];
}

function answerDialogue(engine: Engine, run: Run): Run {
  let current = run;
  const effects = [...run.effects];
  let pending = aiRequests(run.effects).filter((r) => r.kind === 'dialogue.turn');
  while (pending.length > 0) {
    const events = pending.map((request) => {
      const ctx = request.context as { local?: { speakerIds?: string[] } };
      const speaker = ctx.local?.speakerIds?.[0] ?? 'N1';
      return {
        type: 'AI_RESULT' as const,
        reqId: request.reqId,
        payload: { lines: [{ speaker, text: '病人已經恢復心跳，一切安好' }] },
      };
    });
    current = feed(engine, current.state, events);
    effects.push(...current.effects);
    pending = aiRequests(current.effects).filter((r) => r.kind === 'dialogue.turn');
  }
  return { state: current.state, effects };
}

export function start(
  seed: string,
  caseId: string,
  extra: Partial<{ playerRank: 'HO' | 'MO' | 'RES' }> = {},
  engine: Engine = realEngine(),
): Session {
  const state = engine.init({ ...params(seed), caseId, ...extra });
  return { engine, state, effects: [] };
}

export function wait(session: Session, gameSeconds: number): Session {
  const run = advance(session.engine, session.state, gameSeconds);
  return { ...session, state: run.state, effects: [...session.effects, ...run.effects] };
}

/** 玩家講一句指令（快捷詞／formulary 句式），所有審視一律 OK，等待 `seconds` 遊戲秒 */
export function give(session: Session, text: string, seconds = 20, ai: AiMode = 'ignore'): Session {
  let run = answerGates(session.engine, feed(session.engine, session.state, [say(text)]));
  if (ai === 'cheerful') run = answerDialogue(session.engine, run);
  const advanced = advance(session.engine, run.state, seconds);
  let tail: Run = advanced;
  if (ai === 'cheerful') tail = answerDialogue(session.engine, advanced);
  return {
    ...session,
    state: tail.state,
    effects: [...session.effects, ...run.effects, ...tail.effects],
  };
}

export function untilArrest(session: Session, maxSeconds = 600): Session {
  let current = session;
  for (let i = 0; i < maxSeconds / 10; i += 1) {
    if (current.state.resus?.status === 'ARREST') return current;
    current = wait(current, 10);
  }
  throw new Error('病人冇喺預期時間內停頓');
}

export function completeStep(session: Session, step: string): Session {
  const run = feed(session.engine, session.state, [
    intentEvent({
      type: 'EXTENSION',
      module: 'death',
      name: 'COMPLETE_STEP',
      payload: { step },
    }),
  ]);
  return { ...session, state: run.state };
}

export function ratePerRealMs(state: GameState): number {
  return gameSecondsPerRealMs(config, state);
}

/** 標準流程：CPR → rhythm check →（可電擊就電擊）→ adrenaline */
export function standardCycle(session: Session): Session {
  let s = give(session, 'cpr', 10);
  s = give(s, 'rhythm check', 15);
  if (s.state.resus?.status !== 'ARREST') return s;
  const shockable = ['VENTRICULAR_FIBRILLATION', 'PULSELESS_VT', 'TORSADES_DE_POINTES'].includes(
    s.state.resus.rhythm,
  );
  if (shockable) s = give(s, 'defib 200 j', 15);
  if (s.state.resus?.status !== 'ARREST') return s;
  return give(s, 'adrenaline 1 mg iv', 20);
}
