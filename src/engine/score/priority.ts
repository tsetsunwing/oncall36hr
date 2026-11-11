import { isWardPatientActive } from '../ward/departure';
/**
 * 優先次序與時間管理（C5 A）：對比玩家處理次序同 MEWS band、未回覆來電、必要處置時間窗。
 * - 緊急度：搶救 3、MEWS ALARM／EMERGENCY 來電 2、MEWS CAUTION／URGENT 來電／必要處置逾時 1、其餘 0。
 * - 玩家處理某病人時：若有更緊急、且已等超過 graceSec 嘅病人未處理 → 「先處理較不緊急」（每個等待事件只記一次）。
 * - 若有多宗緊急事件同時存在而玩家先處理最緊急者 → 「先處理最緊急」（每個事件只記一次）。
 */
import type { Patient } from '../case/patient';
import type { EngineContext, EngineModule } from '../core/module';
import type { PlayerIntent, Reduction } from '../core/events';
import type { GameState } from '../core/state';
import { patientAtBed } from '../ward/movement';
import { requiredItemsFor, requiredKey } from './requiredOrders';
import { applyRule } from './scoring';

export interface Urgency {
  level: number;
  since: number;
}

const ALERT_LEVEL: Readonly<Record<string, number>> = { CAUTION: 1, ALARM: 2 };
const CALL_LEVEL: Readonly<Record<string, number>> = { URGENT: 1, EMERGENCY: 2 };

export function bandLevel(patient: Patient, ctx: EngineContext): number {
  const band = ctx.tables.mews[0]?.bands.find((b) => b.id === patient.visible.mews.band);
  return ALERT_LEVEL[band?.alert ?? 'NONE'] ?? 0;
}

/** 每次抽樣後更新 MEWS 緊急度起點（只有等級改變先重設起點） */
export function trackBandUrgency(state: GameState, patientId: string, ctx: EngineContext) {
  const patient = state.patients[patientId];
  if (!patient) return state;
  const level = bandLevel(patient, ctx);
  const tracked = state.priority.urgency[patientId];
  if (level === 0) {
    if (!tracked) return state;
    const rest = Object.fromEntries(
      Object.entries(state.priority.urgency).filter(([id]) => id !== patientId),
    );
    return { ...state, priority: { ...state.priority, urgency: rest } };
  }
  if (tracked?.level === level) return state;
  return {
    ...state,
    priority: {
      ...state.priority,
      urgency: { ...state.priority.urgency, [patientId]: { level, since: state.clock.t } },
    },
  };
}

function consider(best: Urgency | null, level: number, since: number): Urgency | null {
  if (level <= 0) return best;
  if (!best || level > best.level || (level === best.level && since < best.since)) {
    return { level, since };
  }
  return best;
}

export function urgencyOf(state: GameState, patient: Patient, ctx: EngineContext): Urgency {
  let best: Urgency | null = null;
  if (state.resus?.status === 'ARREST' && state.resus.patientId === patient.id) {
    best = consider(best, 3, state.resus.onsetAt);
  }
  const tracked = state.priority.urgency[patient.id];
  if (tracked?.level === bandLevel(patient, ctx)) {
    best = consider(best, tracked.level, tracked.since);
  }
  for (const call of state.ward.calls) {
    if (call.patientId !== patient.id) continue;
    if (call.status !== 'RINGING' && call.status !== 'DEFERRED') continue;
    best = consider(best, CALL_LEVEL[call.priority] ?? 0, call.arrivedAt);
  }
  for (const item of requiredItemsFor(patient, ctx)) {
    const key = requiredKey(item, patient);
    if (patient.hidden.fsm.flags.includes(item.flag)) continue;
    if (state.scoreLedger.some((e) => e.evidenceRef === key)) continue;
    const dueAt = patient.hidden.fsm.enteredAt + item.windowSec;
    if (state.clock.t > dueAt) best = consider(best, 1, dueAt);
  }
  return best ?? { level: 0, since: 0 };
}

const episodeKey = (patientId: string, since: number, kind: 'LOWER' | 'FIRST') =>
  `prio:${kind}:${patientId}:${String(since)}`;

const credited = (state: GameState, key: string) =>
  state.scoreLedger.some((e) => e.evidenceRef === key);

export function attendedPatientOf(
  before: GameState,
  after: GameState,
  intent: PlayerIntent,
): string | null {
  if (after === before) return null;
  switch (intent.type) {
    case 'PLACE_ORDER':
      return after.counters.order > before.counters.order ? intent.patientId : null;
    case 'SUBMIT_CHAT':
    case 'PLACE_CATALOG':
    case 'PLACE_CATALOG_BATCH':
    case 'ENTER_BED':
      return intent.patientId;
    case 'EXTENSION': {
      if (intent.module !== 'ward') return null;
      const payload = intent.payload as { bed?: unknown; callId?: unknown; response?: unknown };
      if (intent.name === 'GO_TO_BED' && typeof payload.bed === 'number') {
        return patientAtBed(after, payload.bed);
      }
      if (intent.name === 'RESPOND_CALL' && payload.response === 'GO_NOW') {
        return after.ward.calls.find((c) => c.id === payload.callId)?.patientId ?? null;
      }
      return null;
    }
    default:
      return null;
  }
}

export function judgeAttention(
  state: GameState,
  attendedId: string,
  ctx: EngineContext,
): GameState {
  const model = ctx.tables['scoring-model'][0];
  const attended = state.patients[attendedId];
  if (!model || !attended || state.clock.phase === 'ENDED') return state;
  const now = state.clock.t;
  const mine = urgencyOf(state, attended, ctx);
  const others = Object.values(state.patients)
    .filter((p) => p.id !== attendedId && isWardPatientActive(p))
    .map((p) => ({ patient: p, urgency: urgencyOf(state, p, ctx) }))
    .filter((o) => o.urgency.level >= 1);

  let next = state;
  const higher = others
    .filter((o) => o.urgency.level > mine.level)
    .map((o) => ({
      ...o,
      waitedSec: now - Math.max(o.urgency.since, state.priority.lastAttended[o.patient.id] ?? 0),
    }))
    .filter((o) => o.waitedSec >= model.priority.graceSec)
    .sort((a, b) => b.urgency.level - a.urgency.level || b.waitedSec - a.waitedSec);
  const neglected = higher.find(
    (o) => !credited(state, episodeKey(o.patient.id, o.urgency.since, 'LOWER')),
  );
  if (neglected) {
    next = applyRule(next, 'PRIORITY_LOWER_FIRST', ctx, {
      patientId: neglected.patient.id,
      evidence: episodeKey(neglected.patient.id, neglected.urgency.since, 'LOWER'),
      facts: {
        attendedPatientId: attendedId,
        attendedLevel: mine.level,
        neglectedLevel: neglected.urgency.level,
        waitedSec: neglected.waitedSec,
      },
    });
  } else if (
    mine.level >= 1 &&
    others.length > 0 &&
    !others.some((o) => o.urgency.level > mine.level) &&
    (state.priority.lastAttended[attendedId] ?? -1) < mine.since &&
    !credited(state, episodeKey(attendedId, mine.since, 'FIRST'))
  ) {
    next = applyRule(next, 'PRIORITY_MOST_URGENT_FIRST', ctx, {
      patientId: attendedId,
      evidence: episodeKey(attendedId, mine.since, 'FIRST'),
      facts: { level: mine.level, competing: others.length, reactionSec: now - mine.since },
    });
  }
  return {
    ...next,
    priority: {
      ...next.priority,
      lastAttended: { ...next.priority.lastAttended, [attendedId]: now },
    },
  };
}

export const priorityModule: EngineModule = {
  name: 'priority',
  afterIntent(before, after, intent, ctx): Reduction | undefined {
    const attendedId = attendedPatientOf(before, after.state, intent);
    if (!attendedId) return undefined;
    const judged = judgeAttention(after.state, attendedId, ctx);
    return judged === after.state ? undefined : { state: judged, effects: after.effects };
  },
};
