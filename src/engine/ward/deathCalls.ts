/** 死亡流程嘅兩步電話：通知上一級（SBAR 預填草稿）、致電家屬（雙向對話）。 */
import type { DeathStepId } from '../case/tables';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { notice } from './callStore';
import { vitalsRefOf } from './consult';
import { startFamilyCall } from './family';
import { buildDeathSbarDraft } from './sbar';
import { RANKS, type Rank } from './wardTypes';

const isRank = (value: string): value is Rank => (RANKS as readonly string[]).includes(value);

export function startDeathCall(state: GameState, step: DeathStepId, ctx: EngineContext): Reduction {
  if (step === 'PHONE_FAMILY') return startFamilyCall(state, ctx);
  if (step !== 'NOTIFY_SENIOR') return { state, effects: [notice('CALL_TARGET_INVALID')] };
  const death = state.death;
  if (death?.status !== 'PENDING_PROCESS' || death.steps.NOTIFY_SENIOR !== null) {
    return { state, effects: [notice('CALL_TARGET_INVALID')] };
  }
  if (!isRank(death.seniorRank)) return { state, effects: [notice('CALL_TARGET_INVALID')] };
  const target = { kind: 'RANK', rank: death.seniorRank } as const;
  const sbar = buildDeathSbarDraft(state, death.patientId, target, ctx);
  const vitalsRef = vitalsRefOf(state, death.patientId);
  if (!sbar || !vitalsRef) return { state, effects: [notice('SBAR_INVALID')] };
  return {
    state: {
      ...state,
      ward: {
        ...state.ward,
        draft: {
          patientId: death.patientId,
          target,
          sbar,
          createdAt: state.clock.t,
          purpose: 'DEATH_SENIOR',
          vitalsRef,
        },
      },
    },
    effects: [],
  };
}
