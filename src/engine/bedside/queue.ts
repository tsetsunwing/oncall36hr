import { patientTokens, queueDialogue, vitalTokens, type Beat } from '../chat/dialogue';
import type { Patient } from '../case/patient';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';

/** 將 beats 同當刻凍結嘅 state 衍生 token 一齊送去對白管線 */
export function queueBeatsForOrders(
  state: GameState,
  patient: Patient,
  beats: Beat[],
  extraTokens: Record<string, string>,
  addressed: string[],
  ctx: EngineContext,
  resolvedOrder?: { catalogId: string; label: string },
): Reduction {
  const tokens = { ...vitalTokens(patient, ctx.tables), ...patientTokens(patient), ...extraTokens };
  const queued = queueDialogue(
    state,
    {
      patientId: patient.id,
      beats,
      tokens,
      addressed,
      ...(resolvedOrder ? { resolvedOrder } : {}),
    },
    ctx,
  );
  return queued
    ? { state: queued.state, effects: queued.effect ? [queued.effect] : [] }
    : { state, effects: [] };
}
