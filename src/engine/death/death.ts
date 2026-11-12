/**
 * 死亡流程（spec §18、plan §11）：病人死亡後要完成四步（死亡證明、通知上一級、致電家屬、簡短記錄）。
 * 四步全部完成前床位不釋放；遊戲繼續行，每隔一段時間按 T23 扣「臨床結果」分（幅度係預設值）。
 * 預填內容係 case 資料映射，玩家只按鈕確認，唔做文書。
 */
import { narrate, type Step } from '../acls/arrest';
import type { Death } from '../acls/resusState';
import { DEATH_STEP_IDS, type DeathModelRow, type DeathStepId } from '../case/tables';
import { enqueue, removeWhere } from '../core/eventQueue';
import type { EngineContext } from '../core/module';
import type { Reduction } from '../core/events';
import type { GameState } from '../core/state';
import { logEvent } from '../log/log';
import { applyRule } from '../score/scoring';
import { departPatient } from '../ward/departure';

export const DEATH_DELAY_EVENT = 'DEATH_DELAY_TICK';
export const DEATH_EVENT_PRIORITY = 20;

export function deathModelOf(ctx: EngineContext): DeathModelRow | undefined {
  return ctx.tables['death-process'].find((r): r is DeathModelRow => r.kind === 'MODEL');
}

function scheduleDelay(state: GameState, patientId: string, at: number): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time: at,
      priority: DEATH_EVENT_PRIORITY,
      kind: DEATH_DELAY_EVENT,
      payload: { patientId },
    }),
  };
}

export function beginDeath(state: GameState, patientId: string, ctx: EngineContext): Step {
  const model = deathModelOf(ctx);
  const patient = state.patients[patientId];
  if (!model || !patient || state.death[patientId]?.status === 'PENDING_PROCESS')
    return { state, effects: [] };
  const t = state.clock.t;
  const resus = state.resus[patientId];
  let next: GameState = {
    ...state,
    death: {
      ...state.death,
      [patientId]: {
        patientId,
        diedAt: t,
        status: 'PENDING_PROCESS',
        steps: { CERTIFICATE: null, NOTIFY_SENIOR: null, PHONE_FAMILY: null, RECORD: null },
        seniorRank: model.seniorByRank[state.playerRank],
        delayCharges: 0,
        completedAt: null,
        summary: {
          cycles: resus?.cycles ?? 0,
          shocks: resus?.shocks ?? 0,
          drugs: resus?.drugs.length ?? 0,
        },
      },
    },
  };
  next = logEvent(next, { patientId, reasonCode: 'DEATH_PRONOUNCED' });
  next = applyRule(next, 'PATIENT_DEATH', ctx, { patientId, evidence: `death:${patientId}` });
  next = scheduleDelay(next, patientId, t + model.delayIntervalSec);
  return narrate(
    next,
    patientId,
    [{ type: 'DEATH_PRONOUNCED', speaker: 'NURSE', tokens: ['patient.name', 'patient.bed'] }],
    {},
    ctx,
  );
}

/** 仲未完成死亡流程嘅病人（多過一個時，最早死亡嗰個行先）。 */
export function pendingDeaths(state: GameState): Death[] {
  return Object.values(state.death)
    .filter((d) => d.status === 'PENDING_PROCESS')
    .sort((a, b) => a.diedAt - b.diedAt);
}

/** 呢位病人嘅死亡流程（未開始＝undefined）。 */
export function deathOf(state: GameState, patientId: string): Death | undefined {
  return state.death[patientId];
}

export function isDeathStep(value: unknown): value is DeathStepId {
  return typeof value === 'string' && (DEATH_STEP_IDS as readonly string[]).includes(value);
}

export function completeDeathStep(
  state: GameState,
  patientId: string,
  step: DeathStepId,
): Reduction {
  const death = state.death[patientId];
  if (death?.status !== 'PENDING_PROCESS' || death.steps[step] !== null) {
    return { state, effects: [] };
  }
  const t = state.clock.t;
  const steps = { ...death.steps, [step]: t };
  const complete = DEATH_STEP_IDS.every((id) => steps[id] !== null);
  let next: GameState = {
    ...state,
    death: {
      ...state.death,
      [patientId]: {
        ...death,
        steps,
        status: complete ? 'COMPLETE' : 'PENDING_PROCESS',
        completedAt: complete ? t : null,
      },
    },
  };
  next = logEvent(next, { patientId: death.patientId, reasonCode: `DEATH_STEP_${step}` });
  if (complete) {
    next = logEvent(next, { patientId: death.patientId, reasonCode: 'DEATH_PROCESS_COMPLETE' });
    next = {
      ...next,
      scheduler: removeWhere(
        next.scheduler,
        (e) =>
          e.kind === DEATH_DELAY_EVENT &&
          typeof e.payload === 'object' &&
          e.payload !== null &&
          (e.payload as { patientId?: string }).patientId === patientId,
      ),
    };
    next = departPatient(next, death.patientId, 'DEATH');
  }
  return { state: next, effects: [] };
}

/** 死亡流程拖延：每隔 delayIntervalSec 扣一次「臨床結果」分，直至四步完成 */
export function handleDeathDelay(
  state: GameState,
  patientId: string,
  ctx: EngineContext,
  at: number,
): Reduction {
  const death = state.death[patientId];
  const model = deathModelOf(ctx);
  if (death?.status !== 'PENDING_PROCESS' || !model) return { state, effects: [] };
  let next: GameState = {
    ...state,
    death: {
      ...state.death,
      [patientId]: { ...death, delayCharges: death.delayCharges + 1 },
    },
  };
  next = applyRule(next, 'DEATH_PROCESS_DELAY', ctx, {
    patientId: death.patientId,
    evidence: `death:${death.patientId}`,
  });
  return { state: scheduleDelay(next, patientId, at + model.delayIntervalSec), effects: [] };
}
