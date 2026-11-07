/**
 * 死亡流程（spec §18、plan §11）：病人死亡後要完成四步（死亡證明、通知上一級、致電家屬、簡短記錄）。
 * 四步全部完成前床位不釋放；遊戲繼續行，每隔一段時間按 T23 扣「臨床結果」分（幅度係預設值）。
 * 預填內容係 case 資料映射，玩家只按鈕確認，唔做文書。
 */
import { narrate, type Step } from '../acls/arrest';
import { DEATH_STEP_IDS, type DeathModelRow, type DeathStepId } from '../case/tables';
import { enqueue, removeWhere } from '../core/eventQueue';
import type { EngineContext } from '../core/module';
import type { Reduction } from '../core/events';
import type { GameState } from '../core/state';
import { logEvent } from '../log/log';
import { applyRule } from '../score/scoring';

export const DEATH_DELAY_EVENT = 'DEATH_DELAY_TICK';
export const DEATH_EVENT_PRIORITY = 20;

export function deathModelOf(ctx: EngineContext): DeathModelRow | undefined {
  return ctx.tables['death-process'].find((r): r is DeathModelRow => r.kind === 'MODEL');
}

function scheduleDelay(state: GameState, at: number): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time: at,
      priority: DEATH_EVENT_PRIORITY,
      kind: DEATH_DELAY_EVENT,
    }),
  };
}

export function beginDeath(state: GameState, patientId: string, ctx: EngineContext): Step {
  const model = deathModelOf(ctx);
  const patient = state.patients[patientId];
  if (!model || !patient || state.death) return { state, effects: [] };
  const t = state.clock.t;
  const resus = state.resus;
  let next: GameState = {
    ...state,
    death: {
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
  };
  next = logEvent(next, { patientId, reasonCode: 'DEATH_PRONOUNCED' });
  next = applyRule(next, 'PATIENT_DEATH', ctx, { patientId, evidence: `death:${patientId}` });
  next = scheduleDelay(next, t + model.delayIntervalSec);
  return narrate(
    next,
    patientId,
    [{ type: 'DEATH_PRONOUNCED', speaker: 'NURSE', tokens: ['patient.name', 'patient.bed'] }],
    {},
    ctx,
  );
}

export function isDeathStep(value: unknown): value is DeathStepId {
  return typeof value === 'string' && (DEATH_STEP_IDS as readonly string[]).includes(value);
}

export function completeDeathStep(state: GameState, step: DeathStepId): Reduction {
  const death = state.death;
  if (death?.status !== 'PENDING_PROCESS' || death.steps[step] !== null) {
    return { state, effects: [] };
  }
  const t = state.clock.t;
  const steps = { ...death.steps, [step]: t };
  const complete = DEATH_STEP_IDS.every((id) => steps[id] !== null);
  let next: GameState = {
    ...state,
    death: {
      ...death,
      steps,
      status: complete ? 'COMPLETE' : 'PENDING_PROCESS',
      completedAt: complete ? t : null,
    },
  };
  next = logEvent(next, { patientId: death.patientId, reasonCode: `DEATH_STEP_${step}` });
  if (complete) {
    next = logEvent(next, { patientId: death.patientId, reasonCode: 'DEATH_PROCESS_COMPLETE' });
    next = {
      ...next,
      scheduler: removeWhere(next.scheduler, (e) => e.kind === DEATH_DELAY_EVENT),
    };
  }
  return { state: next, effects: [] };
}

/** 死亡流程拖延：每隔 delayIntervalSec 扣一次「臨床結果」分，直至四步完成 */
export function handleDeathDelay(state: GameState, ctx: EngineContext, at: number): Reduction {
  const death = state.death;
  const model = deathModelOf(ctx);
  if (death?.status !== 'PENDING_PROCESS' || !model) return { state, effects: [] };
  let next: GameState = {
    ...state,
    death: { ...death, delayCharges: death.delayCharges + 1 },
  };
  next = applyRule(next, 'DEATH_PROCESS_DELAY', ctx, {
    patientId: death.patientId,
    evidence: `death:${death.patientId}`,
  });
  return { state: scheduleDelay(next, at + model.delayIntervalSec), effects: [] };
}
