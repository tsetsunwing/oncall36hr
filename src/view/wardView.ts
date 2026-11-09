/**
 * 病房 ViewModel（M4）：平面圖、電話、上報梯、委派。
 * B7：下屬嘅資歷（level）、可靠度、速度倍數、預計完成時間永遠唔會映射入呢度；
 * 委派畫面只顯示已經發生嘅實際結果。
 */
import {
  reachableRanks,
  renderTemplate,
  skippedRanks,
  type Call,
  type EngineTables,
  type GameState,
  type Rank,
} from '@/engine';
import type { ViewEnv } from './viewEnv';
import type {
  BedView,
  CallExchangeView,
  CallLineView,
  CallRowView,
  DelegationView,
  LadderStepView,
  PhoneView,
  SbarDraftView,
  WardView,
} from './types';

type ClockLabel = (t: number) => string;

const ALL_RANKS: readonly Rank[] = ['HO', 'MO', 'RES', 'AC', 'COS'];

/** 瑪麗醫院／港大病房會外撥嘅臨床部門。SURGERY、LAB 只供現有來電，唔出現喺呢度。 */
const OUTBOUND_DEPT_IDS = [
  'AED',
  'ANAESTHESIOLOGY',
  'ONCOLOGY',
  'ICU',
  'CARDIOLOGY',
  'ENDOCRINOLOGY',
  'GASTROENTEROLOGY',
  'GERIATRICS',
  'HAEMATOLOGY',
  'INFECTIOUS_DISEASES',
  'NEPHROLOGY',
  'NEUROLOGY',
  'RESPIRATORY',
  'RHEUMATOLOGY',
  'CARDIOTHORACIC_SURGERY',
  'NEUROSURGERY',
  'BREAST_SURGERY',
  'COLORECTAL_SURGERY',
  'HPB_SURGERY',
  'UPPER_GI_SURGERY',
  'UROLOGY',
  'PLASTIC_SURGERY',
  'VASCULAR_SURGERY',
  'ORTHOPAEDICS',
  'OBSTETRICS_GYNAECOLOGY',
  'PAEDIATRICS',
  'OPHTHALMOLOGY',
  'ENT',
  'PSYCHIATRY',
  'RADIOLOGY',
  'PATHOLOGY',
  'MICROBIOLOGY',
  'PHARMACY',
] as const;

function outboundDepartments(env: ViewEnv): { id: string; label: string }[] {
  const byId = new Map(env.tables['consult-departments'].map((dept) => [dept.id, dept.label]));
  return OUTBOUND_DEPT_IDS.flatMap((id) => {
    const label = byId.get(id);
    return label === undefined ? [] : [{ id, label }];
  });
}

function bedLevel(bandId: string | null, tables: EngineTables) {
  const alert = tables.mews[0]?.bands.find((b) => b.id === bandId)?.alert;
  return alert === 'ALARM' ? 'ALARM' : alert === 'CAUTION' ? 'CAUTION' : 'NORMAL';
}

function selectBeds(state: GameState, env: ViewEnv): BedView[] {
  const { tables } = env;
  const byBed = new Map(Object.values(state.patients).map((p) => [p.bed, p] as const));
  const beds: BedView[] = [];
  for (const row of tables['ward-layout']) {
    if (row.kind !== 'BED') continue;
    const patient = byBed.get(row.bed);
    const bandId = patient?.visible.mews.band ?? null;
    beds.push({
      bed: row.bed,
      zone: row.zone,
      row: row.row,
      col: row.col,
      patientId: patient?.id ?? null,
      name: patient?.demographics.name ?? null,
      age: patient?.demographics.age ?? null,
      sex: patient?.demographics.sex ?? null,
      complaint: patient?.presentingComplaint ?? null,
      mewsScore: patient?.visible.mews.score ?? null,
      mewsBandId: bandId,
      level: patient ? bedLevel(bandId, tables) : 'NORMAL',
      newAdmission: patient
        ? (state.ward.tags[patient.id]?.includes('ED_ADMISSION') ?? false)
        : false,
      nurseName: patient
        ? (state.chats[patient.id]?.present.find((p) => p.kind === 'NURSE')?.name ?? null)
        : null,
      here: state.ward.location.bed === row.bed,
    });
  }
  return beds.sort((a, b) => a.bed - b.bed);
}

function selectLine(line: Call['lines'][number], clockLabel: ClockLabel): CallLineView {
  const isCode = line.template.startsWith('@');
  return {
    speaker: line.speaker,
    name: line.name,
    text: isCode ? null : renderTemplate(line.template, line.tokenValues),
    code: isCode ? line.template.slice(1) : null,
    timeLabel: clockLabel(line.t),
  };
}

function selectCall(
  state: GameState,
  call: Call,
  env: ViewEnv,
  clockLabel: ClockLabel,
): CallRowView {
  const patient = call.patientId ? state.patients[call.patientId] : undefined;
  const dept = call.deptId
    ? env.tables['consult-departments'].find((d) => d.id === call.deptId)
    : undefined;
  const first = call.lines[0];
  const open = call.status === 'RINGING' || call.status === 'DEFERRED';
  const delegable = call.direction === 'IN' && call.delegable && open && state.ward.sub !== null;
  return {
    id: call.id,
    direction: call.direction,
    tag: call.tag,
    priority: call.priority,
    callerName: call.callerName,
    callerRank: call.callerRank,
    patientId: call.patientId,
    bed: patient?.bed ?? null,
    patientName: patient?.demographics.name ?? null,
    deptId: call.deptId,
    deptLabel: dept?.label ?? null,
    text: call.direction === 'IN' && first ? renderTemplate(first.template, first.tokenValues) : '',
    status: call.status,
    resolution: call.resolution,
    outcome: call.outcome,
    timeLabel: clockLabel(call.arrivedAt),
    remainingSec: open ? Math.max(0, call.expiresAt - state.clock.t) : null,
    defers: call.defers,
    canRespond: call.direction === 'IN' && open,
    canDelegate: delegable,
    sbar: call.sbar,
    lines: call.lines.map((line) => selectLine(line, clockLabel)),
    purpose: call.purpose,
    exchange: selectExchange(call, env),
  };
}

function selectExchange(call: Call, env: ViewEnv): CallExchangeView | null {
  const exchange = call.exchange;
  if (!exchange) return null;
  const open = exchange.phase === 'OPEN';
  const consult = exchange.consult;
  const family = exchange.family;
  const scenario = env.tables['family-scenarios'][0];
  const followupsLeft = consult
    ? Math.max(0, env.config.consult.maxFollowups - consult.followups)
    : 0;
  return {
    phase: exchange.phase,
    waiting: exchange.phase === 'ASSESSING' || exchange.phase === 'AWAITING_REPLY',
    clarity: consult?.clarity ?? null,
    asks: consult ? [...consult.asks] : [],
    canFollowUp: open && consult !== null && followupsLeft > 0,
    followupsLeft,
    followupMaxChars: env.config.consult.followupMaxChars,
    canHangUp: open,
    family:
      family && scenario
        ? {
            stage: family.stage,
            informed: family.informed,
            options: open
              ? scenario.stages[family.stage].map((o) => ({ id: o.id, label: o.label }))
              : [],
            canSay: open,
            maxChars: env.config.consult.followupMaxChars,
            turnsLeft: Math.max(0, env.config.family.maxTurns - family.turns),
          }
        : null,
  };
}

function selectDraft(state: GameState, env: ViewEnv): SbarDraftView | null {
  const draft = state.ward.draft;
  const patient = draft ? state.patients[draft.patientId] : undefined;
  if (!draft || !patient) return null;
  const raw = draft.target;
  const target =
    raw.kind === 'RANK'
      ? ({ kind: 'RANK', rank: raw.rank } as const)
      : ({
          kind: 'DEPT',
          deptId: raw.deptId,
          label:
            env.tables['consult-departments'].find((d) => d.id === raw.deptId)?.label ?? raw.deptId,
        } as const);
  return {
    patientId: patient.id,
    bed: patient.bed,
    patientName: patient.demographics.name,
    target,
    sbar: { ...draft.sbar },
    maxChars: env.config.phone.sbarMaxChars,
    skips: draft.target.kind === 'RANK' ? skippedRanks(state, patient.id, draft.target.rank) : [],
    purpose: draft.purpose,
  };
}

function selectPhone(state: GameState, env: ViewEnv, clockLabel: ClockLabel): PhoneView {
  const calls = [...state.ward.calls]
    .sort((a, b) => b.arrivedAt - a.arrivedAt || b.id.localeCompare(a.id, 'en', { numeric: true }))
    .slice(0, env.config.phone.transcriptLimit)
    .map((call) => selectCall(state, call, env, clockLabel));
  const reachable = reachableRanks(state.playerRank);
  const ladders: Record<string, LadderStepView[]> = {};
  for (const patient of Object.values(state.patients)) {
    ladders[patient.id] = ALL_RANKS.filter((r) => r !== 'HO').map((rank) => ({
      rank,
      reachable: reachable.includes(rank),
      skips: reachable.includes(rank) ? skippedRanks(state, patient.id, rank) : [],
      contacted: (state.ward.contacts[patient.id] ?? []).includes(rank),
    }));
  }
  return {
    ringing: state.ward.calls.filter((c) => c.direction === 'IN' && c.status === 'RINGING').length,
    calls,
    ladders,
    depts: outboundDepartments(env),
    draft: selectDraft(state, env),
    focusCallId:
      [...state.ward.calls]
        .reverse()
        .find((c) => c.direction === 'OUT' && c.exchange !== null && c.exchange.phase !== 'CLOSED')
        ?.id ?? null,
  };
}

function selectDelegation(state: GameState, env: ViewEnv, clockLabel: ClockLabel): DelegationView {
  const sub = state.ward.sub;
  const groups = env.tables['delegation-results'].map((row) => ({
    task: row.task,
    items: row.items.map((item) => ({
      id: item.id,
      label: item.label,
      needsPatient: item.needsPatient,
      needsTag: item.needsTag ?? null,
    })),
  }));
  const tasks = [...state.ward.tasks].reverse().map((task) => {
    const patient = task.patientId ? state.patients[task.patientId] : undefined;
    const order = task.orderId ? state.orders[task.orderId] : undefined;
    const finished = task.status !== 'RUNNING';
    const endedAt = order?.status === 'DONE' ? order.completesAt : task.completesAt;
    return {
      id: task.id,
      task: task.task,
      label: task.label,
      bed: patient?.bed ?? null,
      status: task.status,
      startLabel: clockLabel(task.startsAt),
      doneLabel: finished ? clockLabel(endedAt) : null,
      elapsedSec: finished ? Math.max(0, endedAt - task.startsAt) : null,
      failureCode: task.failureCode,
    };
  });
  return {
    hasSubordinate: sub !== null,
    subordinate: sub
      ? { name: sub.name, rank: sub.rank, busy: sub.busyUntil > state.clock.t }
      : null,
    groups,
    tasks,
  };
}

export function selectWard(
  state: GameState,
  env: ViewEnv,
  clockLabel: ClockLabel,
): WardView | null {
  if (!state.ward.enabled) return null;
  const beds = selectBeds(state, env);
  const { location } = state.ward;
  return {
    beds,
    locationBed: location.bed,
    movingToBed: location.movingTo !== null && location.movingTo > 0 ? location.movingTo : null,
    arriveInSec: location.arriveAt !== null ? Math.max(0, location.arriveAt - state.clock.t) : null,
    playerRank: state.playerRank,
    phone: selectPhone(state, env, clockLabel),
    delegation: selectDelegation(state, env, clockLabel),
    occupied: beds.filter((b) => b.patientId !== null).length,
    total: beds.length,
  };
}
