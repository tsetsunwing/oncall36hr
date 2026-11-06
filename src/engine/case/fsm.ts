/**
 * Case FSM（T2）：轉移條件讀 content。每次進入狀態，每條有機率嘅轉移只擲一次（rng.events），
 * 唔會因為取樣頻率高而「擲到中為止」。
 */
import { rngChance, type RngState } from '../core/rng';
import type { Patient } from './patient';
import type { CaseFsmRow, FsmTransitionWhen } from './tables';

export function conditionHolds(when: FsmTransitionWhen, patient: Patient, t: number): boolean {
  const { fsm } = patient.hidden;
  if (when.timeInStateSec !== undefined && t - fsm.enteredAt < when.timeInStateSec) return false;
  if (when.timeAtLeastSec !== undefined && t < when.timeAtLeastSec) return false;
  if (when.flagsAll?.some((flag) => !fsm.flags.includes(flag))) return false;
  if (when.flagsNone?.some((flag) => fsm.flags.includes(flag))) return false;
  if (when.missingAny && !when.missingAny.some((flag) => !fsm.flags.includes(flag))) return false;
  return true;
}

export function evaluateFsm(
  patient: Patient,
  fsm: CaseFsmRow,
  t: number,
  rng: RngState,
): { patient: Patient; rng: RngState } {
  let nextRng = rng;
  let rolled = patient.hidden.fsm.rolled;
  for (let i = 0; i < fsm.transitions.length; i++) {
    const tr = fsm.transitions[i];
    if (!tr || tr.from !== patient.hidden.fsm.state || rolled.includes(i)) continue;
    if (!conditionHolds(tr.when, patient, t)) continue;
    let hit = true;
    if (tr.p < 1) {
      const draw = rngChance(nextRng, 'events', tr.p);
      nextRng = draw.rng;
      hit = draw.value;
    }
    if (hit) {
      return {
        patient: {
          ...patient,
          hidden: {
            ...patient.hidden,
            fsm: { ...patient.hidden.fsm, state: tr.to, enteredAt: t, rolled: [] },
          },
        },
        rng: nextRng,
      };
    }
    rolled = [...rolled, i];
  }
  if (rolled === patient.hidden.fsm.rolled) return { patient, rng: nextRng };
  return {
    patient: {
      ...patient,
      hidden: { ...patient.hidden, fsm: { ...patient.hidden.fsm, rolled } },
    },
    rng: nextRng,
  };
}
