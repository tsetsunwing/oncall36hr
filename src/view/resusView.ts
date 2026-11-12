/**
 * 搶救／死亡流程嘅 ViewModel：只映射玩家本來睇得到嘅資料（節律、已做咗嘅 order、檢查／處理狀態）。
 * 隱藏資料（真正病因、ROSC 機率、擲骰結果）唔會出現。
 */
import {
  aclsModelOf,
  arrestingPatients,
  causeRowsOf,
  DEATH_STEP_IDS,
  pendingDeaths,
  postRoscBundleDone,
  rhythmOf,
  type Death,
  type EngineTables,
  type GameState,
  type Resus,
} from '@/engine';
import type { DeathView, ResusView } from './types';

interface ResusEnv {
  tables: EngineTables;
  config: { acls: { cycleSeconds: number; minCyclesBeforeStop: number } };
}

/**
 * 揀邊一個搶救流程俾玩家睇。次序：
 * 1. 玩家而家企喺嘅床正在停頓 → 嗰個
 * 2. 其他病人正在停頓（最早開始嗰個）
 * 3. 玩家企喺嘅床剛剛 ROSC、仍然喺觀察窗內
 * 4. 其他仍然喺 ROSC 觀察窗內嘅病人
 * 5. 玩家企喺嘅床嘅舊紀錄
 * 6. 最近一次紀錄
 * 兩個病人同時停頓都唔會撞。
 */
function pickResus(state: GameState, focusId: string | null, now: number): Resus | undefined {
  const focus = focusId === null ? undefined : state.resus[focusId];
  if (focus?.status === 'ARREST') return focus;
  const arresting = arrestingPatients(state);
  if (arresting.length > 0) return arresting[0];
  const watching = (r: Resus | undefined): boolean =>
    r?.status === 'ROSC' && r.postRosc !== null && r.postRosc.windowEndsAt > now;
  if (watching(focus)) return focus;
  const others = Object.values(state.resus)
    .filter((r) => watching(r))
    .sort((a, b) => a.onsetAt - b.onsetAt);
  if (others.length > 0) return others[0];
  if (focus) return focus;
  return Object.values(state.resus).sort((a, b) => b.onsetAt - a.onsetAt)[0];
}

function pickDeath(state: GameState, focusId: string | null): Death | undefined {
  const focus = focusId === null ? undefined : state.death[focusId];
  if (focus?.status === 'PENDING_PROCESS') return focus;
  const pending = pendingDeaths(state);
  if (pending.length > 0) return pending[0];
  if (focus) return focus;
  return Object.values(state.death).sort((a, b) => b.diedAt - a.diedAt)[0];
}

export function selectResus(
  state: GameState,
  env: ResusEnv,
  clockLabel: (t: number) => string,
  focusId: string | null = null,
): ResusView | null {
  const resus = pickResus(state, focusId, state.clock.t);
  const model = aclsModelOf(env.tables);
  if (!resus || !model) return null;
  const now = state.clock.t;
  const rhythm = rhythmOf(
    env.tables,
    state.patients[resus.patientId]?.visible.rhythm ?? resus.rhythm,
  );
  const arrest = resus.status === 'ARREST';
  const pending = arrest ? Math.max(0, now - resus.accountedAt) : 0;
  const liveHandsOff =
    resus.noFlowSec + resus.handsOffSec + (resus.cpr.state === 'ACTIVE' ? 0 : pending);
  const bundle = postRoscBundleDone(state, resus, model);
  const cprState = resus.cpr.state;
  return {
    patientId: resus.patientId,
    status: resus.status,
    episode: resus.episode,
    rhythmLabel: rhythm?.label ?? resus.rhythm,
    shockable: rhythm?.shockable ?? false,
    cpr: cprState,
    elapsedSec: Math.max(0, (resus.endedAt ?? now) - resus.onsetAt),
    cycleSeconds: env.config.acls.cycleSeconds,
    cycleElapsedSec:
      arrest && cprState === 'ACTIVE' && resus.cpr.cycleStartedAt !== null
        ? Math.max(0, now - resus.cpr.cycleStartedAt)
        : null,
    cycles: resus.cycles,
    minCyclesBeforeStop: env.config.acls.minCyclesBeforeStop,
    canStop: arrest && resus.cycles >= env.config.acls.minCyclesBeforeStop,
    shocks: resus.shocks,
    handsOffSec: liveHandsOff,
    drugs: resus.drugs.map((d) => {
      const formulary = env.tables.formulary.find((f) => f.id === d.formularyId);
      const dose = d.dose ? ` ${String(d.dose.value)} ${d.dose.unit}` : '';
      return { label: `${formulary?.label ?? d.formularyId}${dose}`, timeLabel: clockLabel(d.at) };
    }),
    causes: causeRowsOf(env.tables).map((cause) => ({
      id: cause.id,
      label: cause.label,
      group: cause.group,
      checked: resus.checkedCauses.includes(cause.id),
      treated: resus.treatedCauses.includes(cause.id),
    })),
    postRosc:
      resus.status === 'ROSC' && resus.postRosc
        ? {
            windowRemainingSec: Math.max(0, resus.postRosc.windowEndsAt - now),
            bundle: model.postRosc.bundle.map((item) => ({
              id: item.id,
              label: item.label,
              done: bundle[item.id] ?? false,
            })),
          }
        : null,
  };
}

export function selectDeath(
  state: GameState,
  env: ResusEnv,
  clockLabel: (t: number) => string,
  focusId: string | null = null,
): DeathView | null {
  const death = pickDeath(state, focusId);
  if (!death) return null;
  const patient = state.patients[death.patientId];
  if (!patient) return null;
  const template = env.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  const rows = env.tables['death-process'].flatMap((r) => (r.kind === 'STEP' ? [r] : []));
  return {
    patientId: death.patientId,
    status: death.status,
    diedAtLabel: clockLabel(death.diedAt),
    prefill: {
      name: patient.demographics.name,
      bed: patient.bed,
      age: patient.demographics.age,
      sex: patient.demographics.sex,
      cause: template?.deathCause ?? '',
      seniorRank: death.seniorRank,
      resusSummary: { ...death.summary },
    },
    steps: DEATH_STEP_IDS.map((step) => {
      const completedAt = death.steps[step];
      return {
        step,
        done: completedAt !== null,
        completedLabel: completedAt === null ? null : clockLabel(completedAt),
        fields: [...(rows.find((r) => r.step === step)?.fields ?? [])],
        viaPhone: state.ward.enabled && (step === 'NOTIFY_SENIOR' || step === 'PHONE_FAMILY'),
      };
    }),
    delayCharges: death.delayCharges,
    bedReleased: death.status === 'COMPLETE',
  };
}
