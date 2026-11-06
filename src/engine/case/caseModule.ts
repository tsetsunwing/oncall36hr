/**
 * Case 模組：病人建立、vitals 取樣排程、FSM 轉移、MEWS、rhythm。
 * 全部由 content 表驅動；呢度冇任何臨床數字。
 */
import { abnormalOf, patientTokens, queueDialogue, vitalTokens, type Beat } from '../chat/dialogue';
import { enqueue } from '../core/eventQueue';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState, NewGameParams } from '../core/state';
import { logEvent } from '../log/log';
import { evaluateFsm } from './fsm';
import { computeMews } from './mews';
import type { Patient } from './patient';
import type {
  CaseFsmRow,
  CaseTemplateRow,
  EngineTables,
  TrajectoryRow,
  VitalNumbers,
} from './tables';
import { nextSample, resolveRhythm } from './vitals';
import type { Reduction } from '../core/events';

export const VITALS_SAMPLE_EVENT = 'VITALS_SAMPLE';
export const VITALS_SAMPLE_PRIORITY = 10;

function isSamplePayload(payload: unknown): payload is { patientId: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'patientId' in payload &&
    typeof payload.patientId === 'string'
  );
}

export function trajectoryFor(
  tables: EngineTables,
  fsm: CaseFsmRow,
  stateId: string,
): TrajectoryRow {
  const def = fsm.states[stateId];
  const row = def && tables.trajectories.find((t) => t.id === def.trajectory);
  if (!row) throw new Error(`case ${fsm.id} 狀態 ${stateId} 冇對應 trajectory`);
  return row;
}

function sampleIntervalSec(ctx: EngineContext, alert: string): number {
  return alert === 'ALARM'
    ? ctx.config.vitals.criticalSampleIntervalSeconds
    : ctx.config.vitals.sampleIntervalSeconds;
}

function scheduleSample(state: GameState, patientId: string, at: number): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time: at,
      priority: VITALS_SAMPLE_PRIORITY,
      kind: VITALS_SAMPLE_EVENT,
      payload: { patientId },
    }),
  };
}

function applySample(
  state: GameState,
  patient: Patient,
  fsm: CaseFsmRow,
  ctx: EngineContext,
  t: number,
): { state: GameState; patient: Patient; alert: string; bandId: string } {
  const mewsTable = ctx.tables.mews[0];
  if (!mewsTable) throw new Error('缺少 MEWS 表');

  const evaluated = evaluateFsm(patient, fsm, t, state.rng);
  const trajectory = trajectoryFor(ctx.tables, fsm, evaluated.patient.hidden.fsm.state);
  const sample = nextSample({
    patient: evaluated.patient,
    orders: state.orders,
    tables: ctx.tables,
    config: ctx.config,
    trajectory,
    rng: evaluated.rng,
    t,
  });
  const mews = computeMews(sample.vitals, trajectory.consciousness, mewsTable);
  const rhythm = resolveRhythm(trajectory.rhythm, sample.vitals.hr, ctx.tables);
  const history = [...evaluated.patient.visible.vitalsHistory, { t, ...sample.vitals }].slice(
    -ctx.config.vitals.historyLimit,
  );

  const updated: Patient = {
    ...evaluated.patient,
    hidden: { ...evaluated.patient.hidden, base: sample.base, lastSampleAt: t },
    visible: {
      ...evaluated.patient.visible,
      vitals: { t, ...sample.vitals },
      vitalsHistory: history,
      rhythm,
      consciousness: trajectory.consciousness,
      mews: { score: mews.score, band: mews.band, components: mews.components },
    },
  };
  return {
    state: { ...state, rng: sample.rng },
    patient: updated,
    alert: mews.alert,
    bandId: mews.band,
  };
}

export function createPatientState(
  state: GameState,
  template: CaseTemplateRow,
  ctx: EngineContext,
): GameState {
  const fsm = ctx.tables['case-fsm'].find((f) => f.id === template.fsmId);
  if (!fsm) throw new Error(`case ${template.id} 缺少 FSM ${template.fsmId}`);
  const trajectory = trajectoryFor(ctx.tables, fsm, fsm.initial);
  const t = state.clock.t;
  const base: VitalNumbers = { ...trajectory.target };
  const blank: Patient = {
    id: 'p1',
    bed: template.bed,
    demographics: { ...template.demographics },
    presentingComplaint: template.presentingComplaint,
    allergies: [...template.allergies],
    hidden: {
      caseTemplateId: template.id,
      diagnosisIds: [...template.diagnosisIds],
      fsm: { state: fsm.initial, enteredAt: t, rolled: [], flags: [] },
      base,
      lastSampleAt: t,
      alertedBand: null,
      lastAlertAt: null,
      activeEffects: [],
    },
    visible: {
      vitals: { t, ...base },
      vitalsHistory: [],
      reports: [],
      rhythm: trajectory.rhythm,
      consciousness: trajectory.consciousness,
      mews: { score: 0, band: '', components: {} },
    },
  };
  const applied = applySample(
    { ...state, patients: { ...state.patients, [blank.id]: blank } },
    blank,
    fsm,
    ctx,
    t,
  );
  const next: GameState = {
    ...applied.state,
    patients: {
      ...applied.state.patients,
      [blank.id]: { ...applied.patient, hidden: { ...applied.patient.hidden, alertedBand: null } },
    },
  };
  return scheduleSample(
    logEvent(next, { patientId: null, reasonCode: 'SHIFT_START' }),
    blank.id,
    t + sampleIntervalSec(ctx, applied.alert),
  );
}

export const caseModule: EngineModule = {
  name: 'case',

  init(state: GameState, params: NewGameParams, ctx: EngineContext) {
    const template = params.caseId
      ? ctx.tables['case-templates'].find((c) => c.id === params.caseId)
      : ctx.tables['case-templates'][0];
    if (!template) return state;
    return createPatientState(state, template, ctx);
  },

  handleScheduled(state, event, ctx): Reduction | undefined {
    if (event.kind !== VITALS_SAMPLE_EVENT) return undefined;
    if (!isSamplePayload(event.payload)) return { state, effects: [] };
    const patient = state.patients[event.payload.patientId];
    if (!patient) return { state, effects: [] };
    const template = ctx.tables['case-templates'].find(
      (c) => c.id === patient.hidden.caseTemplateId,
    );
    const fsm = ctx.tables['case-fsm'].find((f) => f.id === template?.fsmId);
    if (!fsm) return { state, effects: [] };

    const t = event.time;
    const applied = applySample(state, patient, fsm, ctx, t);
    let next: GameState = {
      ...applied.state,
      patients: { ...applied.state.patients, [patient.id]: applied.patient },
    };
    const effects: Reduction['effects'] = [];

    const mewsTable = ctx.tables.mews[0];
    const rank = (band: string | null) => mewsTable?.bands.find((b) => b.id === band)?.min ?? -1;
    const previous = applied.patient.hidden;
    let alertedBand = previous.alertedBand;
    let lastAlertAt = previous.lastAlertAt;
    if (applied.alert === 'NONE') {
      alertedBand = null;
    } else if (applied.alert === 'ALARM') {
      const escalated = alertedBand === null || rank(applied.bandId) > rank(alertedBand);
      const cooled =
        lastAlertAt === null || t - lastAlertAt >= ctx.config.chat.alertCooldownSeconds;
      if (escalated && cooled) {
        alertedBand = applied.bandId;
        lastAlertAt = t;
        const tokens = {
          ...vitalTokens(applied.patient, ctx.tables),
          ...patientTokens(applied.patient),
        };
        const beat: Beat = {
          type: 'ALERT_DETERIORATION',
          speaker: 'NURSE',
          tokens: [...ALERT_TOKENS],
          abnormal: abnormalOf(applied.patient, ctx.tables),
        };
        const queued = queueDialogue(
          next,
          { patientId: patient.id, beats: [beat], tokens, addressed: [] },
          ctx,
        );
        if (queued) {
          next = queued.state;
          effects.push(queued.effect);
        }
      }
    }
    const current = next.patients[patient.id];
    if (current) {
      next = {
        ...next,
        patients: {
          ...next.patients,
          [patient.id]: { ...current, hidden: { ...current.hidden, alertedBand, lastAlertAt } },
        },
      };
    }
    next = scheduleSample(next, patient.id, t + sampleIntervalSec(ctx, applied.alert));
    return { state: next, effects };
  },
};

const ALERT_TOKENS = [
  'mews.score',
  'vital.hr',
  'vital.sbp',
  'vital.dbp',
  'vital.spo2',
  'vital.rr',
  'vital.temp',
  'patient.bed',
] as const;
