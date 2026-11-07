/**
 * 心臟停頓（ACLS）狀態轉移：全部係純函數，由 engine 擁有 ROSC 判定（spec §12、plan §10）。
 * 玩家只落 order（CPR、rhythm check、defib、用藥…）；呢度按 order 完成嘅時機同正確程度計機率，
 * 以 rng.cpr 擲骰。AI 唔會被叫去決定任何結果——佢只會喺 `narrate` 將結果講成對白。
 */
import { queueBeatsForOrders } from '../bedside/queue';
import type { Patient } from '../case/patient';
import type { AclsModelRow, CaseFsmRow, EngineTables, RhythmRow } from '../case/tables';
import { type Beat } from '../chat/dialogue';
import { beginCprSlow, endCprSlow, interruptSpeed } from '../core/clock';
import { enqueue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import { rngChance } from '../core/rng';
import type { GameState } from '../core/state';
import { logEvent } from '../log/log';
import { applyRule } from '../score/scoring';
import { raiseArrestCall } from '../ward/arrestCall';
import {
  aclsModelOf,
  aclsRhythmRowOf,
  computeRoscProbability,
  energyInRange,
  pickWeighted,
  rhythmOf,
} from './model';
import type { DrugGiven, Resus, ResusCycle } from './resusState';

export const ACLS_CYCLE_EVENT = 'ACLS_CYCLE_DUE';
export const ACLS_POSTROSC_EVENT = 'ACLS_POSTROSC_END';
export const ACLS_EVENT_PRIORITY = 20;

export const EMPTY_CYCLE: ResusCycle = {
  shocksOnShockable: 0,
  shocksOnNonShockable: 0,
  wrongEnergy: false,
  drugs: [],
};

export interface Step {
  state: GameState;
  effects: Effect[];
}

/** 護士覆述 order 時用嘅凍結標籤（token 名＋文字）；只來自 order 本身，唔係 AI */
export interface OrderLabel {
  token: string;
  text: string;
}

const labelTokens = (label: OrderLabel | null): Record<string, string> =>
  label ? { [label.token]: label.text } : {};
const labelToken = (label: OrderLabel | null): string | null => label?.token ?? null;

const done = (state: GameState, effects: Effect[] = []): Step => ({ state, effects });

export function joinSteps(first: Step, next: (state: GameState) => Step): Step {
  const second = next(first.state);
  return { state: second.state, effects: [...first.effects, ...second.effects] };
}

export function isArrestOf(
  state: GameState,
  patientId: string,
): state is GameState & {
  resus: Resus;
} {
  return state.resus?.status === 'ARREST' && state.resus.patientId === patientId;
}

/** 護士講嘢：beat 同 token 一齊入對白管線（AI 只負責措辭） */
export function narrate(
  state: GameState,
  patientId: string,
  beats: Beat[],
  tokens: Record<string, string>,
  ctx: EngineContext,
): Step {
  const patient = state.patients[patientId];
  if (!patient) return done(state);
  return queueBeatsForOrders(state, patient, beats, tokens, [], ctx);
}

export function rhythmTokens(rhythm: RhythmRow | undefined, id: string): Record<string, string> {
  return { 'rhythm.label': rhythm?.label ?? id };
}

function setResus(state: GameState, resus: Resus): GameState {
  return { ...state, resus };
}

/** 將 hands-off 時間計到 `now`：未開始 CPR 計入 noFlow；暫停中計入 handsOff */
export function accrue(resus: Resus, now: number): Resus {
  const dt = Math.max(0, now - resus.accountedAt);
  if (dt === 0) return resus;
  if (resus.cpr.state === 'NOT_STARTED') {
    return { ...resus, noFlowSec: resus.noFlowSec + dt, accountedAt: now };
  }
  if (resus.cpr.state === 'PAUSED') {
    return { ...resus, handsOffSec: resus.handsOffSec + dt, accountedAt: now };
  }
  return { ...resus, accountedAt: now };
}

function scheduleCycleDue(state: GameState, resus: Resus, ctx: EngineContext): GameState {
  const startedAt = resus.cpr.cycleStartedAt ?? state.clock.t;
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time: startedAt + ctx.config.acls.cycleSeconds,
      priority: ACLS_EVENT_PRIORITY,
      kind: ACLS_CYCLE_EVENT,
      payload: { episode: resus.episode, startedAt },
    }),
  };
}

function modelOrThrow(ctx: EngineContext): AclsModelRow {
  const model = aclsModelOf(ctx.tables);
  if (!model) throw new Error('缺少 acls-transitions MODEL 列');
  return model;
}

export function fsmOf(patient: Patient, tables: EngineTables): CaseFsmRow | undefined {
  const template = tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  return tables['case-fsm'].find((f) => f.id === template?.fsmId);
}

function arrestStateOf(fsm: CaseFsmRow): string | undefined {
  return Object.entries(fsm.states).find(([, def]) => def.arrest)?.[0];
}

/** 病人而家嘅節律／生命體徵直接設為無脈搏（唔使等下一次取樣） */
export function pulselessVisible(
  patient: Patient,
  rhythmId: string,
  tables: EngineTables,
  t: number,
): Patient {
  const trajectory = tables.trajectories.find((row) => row.id === 'acls.pulseless');
  const zero = trajectory?.target ?? { hr: 0, sbp: 0, dbp: 0, spo2: 0, rr: 0, temp: 0 };
  const vitals = { ...zero, temp: patient.visible.vitals.temp };
  return {
    ...patient,
    hidden: { ...patient.hidden, base: { ...vitals } },
    visible: {
      ...patient.visible,
      vitals: { t, ...vitals },
      rhythm: rhythmId,
      consciousness: 'U',
    },
  };
}

export interface BeginArrestOptions {
  rearrest: boolean;
}

/**
 * 進入心臟停頓：建立 resus、令倍速回到 config 值（突發事件，但 CPR 慢速唔受影響）、護士呼叫。
 * `patient` 嘅 hidden／visible 由呼叫者負責更新（FSM 取樣路徑自己會覆蓋）。
 */
export function beginArrest(
  state: GameState,
  patientId: string,
  rhythmId: string,
  ctx: EngineContext,
  options: BeginArrestOptions,
): Step {
  const model = aclsModelOf(ctx.tables);
  const patient = state.patients[patientId];
  const rhythm = rhythmOf(ctx.tables, rhythmId);
  if (!model || !patient || !rhythm) return done(state);
  const template = ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  const t = state.clock.t;
  const resus: Resus = {
    patientId,
    episode: (state.resus?.episode ?? 0) + 1,
    status: 'ARREST',
    onsetAt: t,
    initialRhythm: rhythmId,
    rhythm: rhythmId,
    causeIds: [...(template?.reversibleCauseIds ?? [])],
    cpr: { state: 'NOT_STARTED', firstAt: null, cycleStartedAt: null },
    accountedAt: t,
    noFlowSec: 0,
    handsOffSec: 0,
    cycles: 0,
    shocks: 0,
    firstShockableAt: rhythm.shockable ? t : null,
    firstShockAt: null,
    cycle: EMPTY_CYCLE,
    drugs: [],
    checkedCauses: [],
    treatedCauses: [],
    roscAt: null,
    roscRhythm: null,
    lastRoll: null,
    postRosc: null,
    endedAt: null,
  };
  let next = logEvent(setResus(state, resus), {
    patientId,
    reasonCode: options.rearrest ? 'REARREST_STARTED' : 'ARREST_STARTED',
  });
  const interrupted = interruptSpeed(next, ctx.config);
  next = interrupted.state;
  const spoke = narrate(
    next,
    patientId,
    [
      {
        type: 'ARREST_ANNOUNCED',
        speaker: 'NURSE',
        tokens: ['patient.bed', 'rhythm.label'],
        rearrest: options.rearrest,
      },
    ],
    rhythmTokens(rhythm, rhythmId),
    ctx,
  );
  const called = raiseArrestCall(spoke.state, patientId, options.rearrest, ctx);
  return {
    state: called.state,
    effects: [...interrupted.effects, ...spoke.effects, ...called.effects],
  };
}

export function startOrResumeCpr(
  state: GameState,
  resus: Resus,
  ctx: EngineContext,
  label: OrderLabel | null,
): Step {
  const t = state.clock.t;
  const model = modelOrThrow(ctx);
  const accrued = accrue(resus, t);
  if (accrued.cpr.state === 'ACTIVE') {
    return narrate(
      setResus(state, accrued),
      accrued.patientId,
      [
        {
          type: 'ACLS_ACTION_DONE',
          speaker: 'NURSE',
          action: 'CPR_ALREADY_RUNNING',
          labelToken: labelToken(label),
        },
      ],
      labelTokens(label),
      ctx,
    );
  }
  const first = accrued.cpr.state === 'NOT_STARTED';
  const started: Resus = {
    ...accrued,
    cpr: { state: 'ACTIVE', firstAt: accrued.cpr.firstAt ?? t, cycleStartedAt: t },
  };
  let next = beginCprSlow(setResus(state, started));
  next = scheduleCycleDue(next, started, ctx);
  next = logEvent(next, {
    patientId: started.patientId,
    reasonCode: first ? 'CPR_STARTED' : 'CPR_RESUMED',
  });
  if (first && t - started.onsetAt > model.scoring.timeToCpr.graceSec) {
    next = applyRule(next, 'TIME_TO_CPR', ctx, {
      patientId: started.patientId,
      evidence: `resus:${String(started.episode)}`,
      facts: { delaySec: t - started.onsetAt, graceSec: model.scoring.timeToCpr.graceSec },
    });
  }
  return narrate(
    next,
    started.patientId,
    [
      {
        type: 'ACLS_ACTION_DONE',
        speaker: 'NURSE',
        action: first ? 'CPR_STARTED' : 'CPR_RESUMED',
        labelToken: labelToken(label),
      },
    ],
    labelTokens(label),
    ctx,
  );
}

interface Evaluation {
  step: Step;
  success: boolean;
}

/** 擲 ROSC（rng.cpr）。成功→ROSC；失敗→按 T9 轉節律。每次評估後重置 cycle 累積 */
function evaluateRosc(
  state: GameState,
  resus: Resus,
  trigger: 'SHOCK' | 'RHYTHM_CHECK',
  ctx: EngineContext,
): Evaluation {
  const model = modelOrThrow(ctx);
  const t = state.clock.t;
  const rhythm = rhythmOf(ctx.tables, resus.rhythm);
  const rhythmRow = aclsRhythmRowOf(ctx.tables, resus.rhythm);
  const patient = state.patients[resus.patientId];
  if (!rhythm || !rhythmRow || !patient) return { step: done(state), success: false };
  const fsm = fsmOf(patient, ctx.tables);

  const accrued = accrue(resus, t);
  const breakdown = computeRoscProbability({
    resus: accrued,
    rhythmRow,
    rhythm,
    model,
    now: t,
    salvageable: fsm?.salvageable ?? true,
    airwaySecured: patient.hidden.fsm.flags.includes(model.airway.flag),
  });
  const draw = rngChance(state.rng, 'cpr', breakdown.p);
  const roll = { t, trigger, p: breakdown.p, success: draw.value, terms: breakdown.terms };
  let next: GameState = { ...state, rng: draw.rng };

  if (draw.value) {
    const settled: Resus = { ...accrued, cycle: EMPTY_CYCLE, lastRoll: roll };
    return { step: achieveRosc(setResus(next, settled), settled, ctx), success: true };
  }

  const shockedThisCycle = accrued.cycle.shocksOnShockable > 0;
  const nextRhythm = pickWeighted(
    shockedThisCycle ? rhythmRow.ifShocked : rhythmRow.ifNoShock,
    next.rng,
  );
  next = { ...next, rng: nextRhythm.rng };
  const nextRow = rhythmOf(ctx.tables, nextRhythm.value);
  const updated: Resus = {
    ...accrued,
    rhythm: nextRhythm.value,
    cycle: EMPTY_CYCLE,
    lastRoll: roll,
    cycles: trigger === 'RHYTHM_CHECK' ? accrued.cycles + 1 : accrued.cycles,
    firstShockableAt:
      accrued.firstShockableAt === null && nextRow?.shockable ? t : accrued.firstShockableAt,
  };
  next = setResus(next, updated);
  const visible = next.patients[resus.patientId];
  if (visible) {
    next = {
      ...next,
      patients: {
        ...next.patients,
        [visible.id]: { ...visible, visible: { ...visible.visible, rhythm: nextRhythm.value } },
      },
    };
  }
  return { step: done(next), success: false };
}

/** ROSC 成功：清慢速、FSM 轉 post-ROSC 狀態、排程觀察窗結束、記分 */
function achieveRosc(state: GameState, resus: Resus, ctx: EngineContext): Step {
  const model = modelOrThrow(ctx);
  const t = state.clock.t;
  const patient = state.patients[resus.patientId];
  if (!patient) return done(state);
  const fsm = fsmOf(patient, ctx.tables);
  const roscRhythm = pickWeighted(model.afterRosc, state.rng);
  let next: GameState = { ...state, rng: roscRhythm.rng };

  const roscResus: Resus = {
    ...resus,
    status: 'ROSC',
    roscAt: t,
    roscRhythm: roscRhythm.value,
    rhythm: roscRhythm.value,
    cpr: { ...resus.cpr, state: 'NOT_STARTED' },
    postRosc: { windowEndsAt: t + model.postRosc.windowSec },
  };
  next = setResus(next, roscResus);

  const base = { ...patient.hidden.base, hr: 0, sbp: 0, dbp: 0, spo2: 0, rr: 0 };
  const postState = fsm?.postRoscState;
  next = {
    ...next,
    patients: {
      ...next.patients,
      [patient.id]: {
        ...patient,
        hidden: {
          ...patient.hidden,
          base,
          fsm: postState
            ? { ...patient.hidden.fsm, state: postState, enteredAt: t, rolled: [] }
            : patient.hidden.fsm,
        },
        visible: { ...patient.visible, rhythm: roscRhythm.value },
      },
    },
    scheduler: enqueue(next.scheduler, {
      time: t + model.postRosc.windowSec,
      priority: ACLS_EVENT_PRIORITY,
      kind: ACLS_POSTROSC_EVENT,
      payload: { episode: roscResus.episode },
    }),
  };
  next = logEvent(next, { patientId: patient.id, reasonCode: 'ROSC' });
  next = applyRule(next, 'ROSC', ctx, {
    patientId: patient.id,
    evidence: `resus:${String(roscResus.episode)}`,
  });
  const released = endCprSlow(next, ctx.config);
  const spoke = narrate(
    released.state,
    patient.id,
    [{ type: 'ACLS_ROSC', speaker: 'NURSE' }],
    {},
    ctx,
  );
  return { state: spoke.state, effects: [...released.effects, ...spoke.effects] };
}

export function performRhythmCheck(
  state: GameState,
  resus: Resus,
  ctx: EngineContext,
  durationSec: number,
): Step {
  const model = modelOrThrow(ctx);
  const t = state.clock.t;
  let working = accrue(resus, t);
  let next = state;

  if (working.cpr.state === 'ACTIVE') {
    const cycleDueAt = (working.cpr.cycleStartedAt ?? t) + ctx.config.acls.cycleSeconds;
    if (t - durationSec > cycleDueAt + model.scoring.cycleGap.graceSec) {
      next = applyRule(next, 'CYCLE_GAP', ctx, {
        patientId: working.patientId,
        evidence: `resus:${String(working.episode)}`,
        facts: {
          delaySec: t - durationSec - cycleDueAt,
          graceSec: model.scoring.cycleGap.graceSec,
        },
      });
    }
    working = {
      ...working,
      handsOffSec: working.handsOffSec + durationSec,
      cpr: { ...working.cpr, state: 'PAUSED' },
    };
  }
  next = logEvent(setResus(next, working), {
    patientId: working.patientId,
    reasonCode: 'RHYTHM_CHECKED',
  });
  const evaluated = evaluateRosc(next, working, 'RHYTHM_CHECK', ctx);
  if (evaluated.success) return evaluated.step;

  const after = evaluated.step.state.resus;
  const rhythm = rhythmOf(ctx.tables, after?.rhythm ?? working.rhythm);
  const spoke = narrate(
    evaluated.step.state,
    working.patientId,
    [
      {
        type: 'ACLS_RHYTHM_REPORTED',
        speaker: 'NURSE',
        tokens: ['rhythm.label'],
        shockable: rhythm?.shockable ?? false,
      },
    ],
    rhythmTokens(rhythm, after?.rhythm ?? working.rhythm),
    ctx,
  );
  return { state: spoke.state, effects: [...evaluated.step.effects, ...spoke.effects] };
}

export function deliverShock(
  state: GameState,
  resus: Resus,
  energyJ: number,
  ctx: EngineContext,
  label: OrderLabel | null,
): Step {
  const model = modelOrThrow(ctx);
  const t = state.clock.t;
  const rhythm = rhythmOf(ctx.tables, resus.rhythm);
  const accrued = accrue(resus, t);
  const shockable = rhythm?.shockable ?? false;
  let working: Resus = {
    ...accrued,
    shocks: accrued.shocks + 1,
    firstShockAt: accrued.firstShockAt ?? (shockable ? t : null),
    cycle: shockable
      ? {
          ...accrued.cycle,
          shocksOnShockable: accrued.cycle.shocksOnShockable + 1,
          wrongEnergy: accrued.cycle.wrongEnergy || !energyInRange(energyJ, model),
        }
      : { ...accrued.cycle, shocksOnNonShockable: accrued.cycle.shocksOnNonShockable + 1 },
  };
  let next = logEvent(setResus(state, working), {
    patientId: working.patientId,
    reasonCode: shockable ? 'SHOCK_DELIVERED' : 'SHOCK_ON_NON_SHOCKABLE',
  });
  const resusRef = `resus:${String(working.episode)}`;
  if (!shockable) {
    next = applyRule(next, 'SHOCK_INAPPROPRIATE', ctx, {
      patientId: working.patientId,
      evidence: resusRef,
      facts: { rhythm: resus.rhythm },
    });
  } else if (!energyInRange(energyJ, model)) {
    next = applyRule(next, 'SHOCK_WRONG_ENERGY', ctx, {
      patientId: working.patientId,
      evidence: resusRef,
      facts: { energyJ },
    });
  }
  if (
    shockable &&
    accrued.firstShockAt === null &&
    accrued.firstShockableAt !== null &&
    t - accrued.firstShockableAt > model.scoring.timeToFirstShock.graceSec
  ) {
    next = applyRule(next, 'TIME_TO_FIRST_SHOCK', ctx, {
      patientId: working.patientId,
      evidence: `resus:${String(working.episode)}`,
      facts: {
        delaySec: t - accrued.firstShockableAt,
        graceSec: model.scoring.timeToFirstShock.graceSec,
      },
    });
  }

  let effects: Effect[] = [];
  if (shockable) {
    const evaluated = evaluateRosc(next, working, 'SHOCK', ctx);
    next = evaluated.step.state;
    effects = evaluated.step.effects;
    if (evaluated.success) return { state: next, effects };
    working = next.resus ?? working;
  }

  if (working.cpr.state === 'PAUSED') {
    const resumed: Resus = {
      ...accrue(working, t),
      cpr: { ...working.cpr, state: 'ACTIVE', cycleStartedAt: t },
    };
    next = scheduleCycleDue(setResus(next, resumed), resumed, ctx);
  }
  const spoke = narrate(
    next,
    working.patientId,
    [
      {
        type: 'ACLS_ACTION_DONE',
        speaker: 'NURSE',
        action: 'SHOCK_DELIVERED',
        labelToken: labelToken(label),
      },
    ],
    labelTokens(label),
    ctx,
  );
  return { state: spoke.state, effects: [...effects, ...spoke.effects] };
}

export function giveDrug(
  state: GameState,
  resus: Resus,
  given: DrugGiven,
  ctx: EngineContext,
  label: OrderLabel | null,
): Step {
  const working: Resus = {
    ...resus,
    drugs: [...resus.drugs, given],
    cycle: { ...resus.cycle, drugs: [...resus.cycle.drugs, given] },
  };
  let next = logEvent(setResus(state, working), {
    patientId: working.patientId,
    reasonCode: 'DRUG_GIVEN',
  });
  if (!given.doseOk) {
    next = applyRule(next, 'ACLS_DRUG_WRONG_DOSE', ctx, {
      patientId: working.patientId,
      evidence: `resus:${String(working.episode)}`,
      facts: { formularyId: given.formularyId },
    });
  }
  return narrate(
    next,
    working.patientId,
    [
      {
        type: 'ACLS_ACTION_DONE',
        speaker: 'NURSE',
        action: 'DRUG_GIVEN',
        labelToken: labelToken(label),
      },
    ],
    labelTokens(label),
    ctx,
  );
}

/** 停止搶救：結束 CPR 慢速、狀態轉 STOPPED（死亡流程由 death 模組接手） */
export function stopResus(state: GameState, resus: Resus, ctx: EngineContext): Step {
  const t = state.clock.t;
  const stopped: Resus = {
    ...accrue(resus, t),
    status: 'STOPPED',
    endedAt: t,
    cpr: { ...resus.cpr, state: 'PAUSED' },
  };
  const next = logEvent(setResus(state, stopped), {
    patientId: stopped.patientId,
    reasonCode: 'RESUS_STOPPED',
  });
  return endCprSlow(next, ctx.config);
}

/** CPR 滿一個 cycle：護士提示玩家做 rhythm check（旁白，唔自動做） */
export function handleCycleDue(
  state: GameState,
  payload: { episode: number; startedAt: number },
  ctx: EngineContext,
): Reduction {
  const resus = state.resus;
  if (
    resus?.status !== 'ARREST' ||
    resus.episode !== payload.episode ||
    resus.cpr.state !== 'ACTIVE' ||
    resus.cpr.cycleStartedAt !== payload.startedAt
  ) {
    return { state, effects: [] };
  }
  const rhythm = rhythmOf(ctx.tables, resus.rhythm);
  return narrate(
    state,
    resus.patientId,
    [{ type: 'ACLS_CYCLE_DUE', speaker: 'NURSE', tokens: ['rhythm.label'] }],
    rhythmTokens(rhythm, resus.rhythm),
    ctx,
  );
}

/** ROSC 之後已完成嘅 bundle 項目（只計 ROSC 之後落嘅 order） */
export function postRoscBundleDone(
  state: GameState,
  resus: Resus,
  model: AclsModelRow,
): Record<string, boolean> {
  const since = resus.roscAt ?? 0;
  const orders = Object.values(state.orders).filter(
    (o) => o.patientId === resus.patientId && o.status === 'DONE' && o.createdAt >= since,
  );
  return Object.fromEntries(
    model.postRosc.bundle.map((item) => [
      item.id,
      orders.some((o) => item.catalogIds.includes(o.catalogId)),
    ]),
  );
}

/** Post-ROSC 觀察窗結束：按 bundle 漏做項目擲 re-arrest（rng.cpr） */
export function handlePostRoscEnd(
  state: GameState,
  payload: { episode: number },
  ctx: EngineContext,
): Reduction {
  const resus = state.resus;
  const model = aclsModelOf(ctx.tables);
  if (resus?.status !== 'ROSC' || resus.episode !== payload.episode || !model) {
    return { state, effects: [] };
  }
  const bundle = postRoscBundleDone(state, resus, model);
  const missing = Object.values(bundle).filter((ok) => !ok).length;
  const p = Math.min(
    1,
    Math.max(0, model.postRosc.rearrestBaseP + missing * model.postRosc.rearrestPerMissing),
  );
  const draw = rngChance(state.rng, 'cpr', p);
  let next: GameState = { ...state, rng: draw.rng };
  const patient = next.patients[resus.patientId];
  if (!draw.value || !patient) {
    next = setResus(next, {
      ...resus,
      status: 'RECOVERED',
      postRosc: null,
      endedAt: state.clock.t,
    });
    return {
      state: logEvent(next, { patientId: resus.patientId, reasonCode: 'POST_ROSC_STABLE' }),
      effects: [],
    };
  }
  const rhythm = pickWeighted(model.postRosc.rearrestRhythms, next.rng);
  next = { ...next, rng: rhythm.rng };
  const fsm = fsmOf(patient, ctx.tables);
  const arrestState = fsm ? arrestStateOf(fsm) : undefined;
  const t = next.clock.t;
  const refreshed = pulselessVisible(patient, rhythm.value, ctx.tables, t);
  next = {
    ...next,
    patients: {
      ...next.patients,
      [patient.id]: {
        ...refreshed,
        hidden: {
          ...refreshed.hidden,
          fsm: arrestState
            ? { ...refreshed.hidden.fsm, state: arrestState, enteredAt: t, rolled: [] }
            : refreshed.hidden.fsm,
        },
      },
    },
  };
  return beginArrest(next, patient.id, rhythm.value, ctx, { rearrest: true });
}
