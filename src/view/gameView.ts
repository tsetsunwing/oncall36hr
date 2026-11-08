/**
 * ViewModel 選擇器（implementation-plan §3、§4.2）：GameState → UI 可顯示嘅唯讀資料。
 * 只映射 `patient.visible`、聊天、order、log；`patient.hidden`（診斷、FSM 狀態、base 值）永遠唔會出現。
 * 所有顯示數值都係 engine 狀態；AI 文字只會經 engine 寫入嘅 ChatLine（已過 numeric guard）出現。
 */
import {
  abnormalOf,
  composeOrderLabel,
  isCancellable,
  meanArterialPressure,
  renderTemplate,
  typingSpeakerIds,
  type EngineTables,
  type GameState,
  type MewsComponentKey,
  type Patient,
} from '@/engine';
import { formatClock } from './clock';
import type {
  ActionRowView,
  AlarmLevel,
  ChatLineView,
  ChatView,
  GateCardView,
  GameView,
  MonitorView,
  OrderRowView,
  PatientView,
  QuickChipView,
  ReportView,
  VitalReadout,
} from './types';
import { selectDeath, selectResus } from './resusView';
import { parseWave, plethAmplitude } from './waveform';
import { selectShift } from './shiftView';
import { selectWard } from './wardView';
import type { ViewEnv } from './viewEnv';

export type { ViewEnv };

function alertLevel(score: number, mews: EngineTables['mews'][number] | undefined): AlarmLevel {
  if (!mews || score <= 0) return 'NORMAL';
  if (score >= mews.componentAlert.alarmMin) return 'ALARM';
  if (score >= mews.componentAlert.cautionMin) return 'CAUTION';
  return 'NORMAL';
}

function bandLevel(bandId: string, mews: EngineTables['mews'][number] | undefined): AlarmLevel {
  const alert = mews?.bands.find((b) => b.id === bandId)?.alert;
  if (alert === 'ALARM') return 'ALARM';
  if (alert === 'CAUTION') return 'CAUTION';
  return 'NORMAL';
}

function rhythmAlarmLevel(alarm: 'NONE' | 'CAUTION' | 'ALARM'): AlarmLevel {
  return alarm === 'NONE' ? 'NORMAL' : alarm;
}

/** 綁現有導管狀態。規格冇 A-line／CVP 讀數，呢度只講邊條喉在位，唔發明數字。 */
const LINE_FLAG = { ALINE: 'aline.in', CVP: 'cvc.in' } as const;

function selectLineSlot(lineFlags: readonly string[]): MonitorView['lineSlot'] {
  if (lineFlags.includes(LINE_FLAG.ALINE)) return { kind: 'ALINE', reviewPending: true };
  if (lineFlags.includes(LINE_FLAG.CVP)) return { kind: 'CVP', reviewPending: true };
  return { kind: null, reviewPending: false };
}

export function selectMonitor(
  patient: Patient,
  env: ViewEnv,
  clockLabel: (t: number) => string,
): MonitorView {
  const { tables } = env;
  const mews = tables.mews[0];
  const v = patient.visible.vitals;
  const abnormal = new Map(abnormalOf(patient, tables).map((a) => [a.key, a.direction] as const));
  const component = (key: MewsComponentKey): VitalReadout => {
    const level = alertLevel(patient.visible.mews.components[key] ?? 0, mews);
    return { text: '', level, direction: abnormal.get(key) ?? null };
  };
  const rhythm = tables.rhythms.find((r) => r.id === patient.visible.rhythm);
  const pulseless = rhythm ? !rhythm.pulse : false;
  const dash = '—';
  const hr = component('hr');
  const sbp = component('sbp');
  const spo2 = component('spo2');
  const rr = component('rr');
  const temp = component('temp');
  const map = meanArterialPressure(v.sbp, v.dbp);
  return {
    hr: { ...hr, text: pulseless ? dash : String(v.hr) },
    bp: {
      ...sbp,
      text: pulseless ? dash : `${String(v.sbp)}/${String(v.dbp)} (${String(map)})`,
      sbp: v.sbp,
      dbp: v.dbp,
    },
    lineSlot: selectLineSlot(patient.hidden.fsm.flags),
    lines: {
      abp: patient.hidden.fsm.flags.includes('aline.in'),
      cvp: patient.hidden.fsm.flags.includes('cvc.in'),
      etco2: patient.hidden.fsm.flags.includes('airway.secured'),
    },
    spo2: { ...spo2, text: pulseless ? dash : String(v.spo2) },
    rr: { ...rr, text: pulseless ? dash : String(v.rr) },
    temp: { ...temp, text: v.temp.toFixed(1) },
    rhythmId: patient.visible.rhythm,
    rhythmLabel: rhythm?.label ?? patient.visible.rhythm,
    rhythmAlarm: rhythm ? rhythmAlarmLevel(rhythm.alarm) : 'NORMAL',
    pulseless,
    waveRate: pulseless ? (rhythm?.electricalRate ?? 0) : v.hr,
    hrValue: v.hr,
    pulseAmplitude: plethAmplitude(v.sbp, v.dbp),
    wave: parseWave(rhythm?.wave),
    mews: {
      score: patient.visible.mews.score,
      bandId: patient.visible.mews.band,
      level: bandLevel(patient.visible.mews.band, mews),
      components: Object.entries(patient.visible.mews.components).map(([key, score]) => ({
        key,
        score,
      })),
      reviewPending: mews?.reviewStatus !== 'REVIEWED',
    },
    consciousness: patient.visible.consciousness,
    sweepSeconds: env.config.ui.monitor.sweepSeconds,
    targetFps: env.config.ui.monitor.targetFps,
    asOfLabel: clockLabel(v.t),
  };
}

function selectPatient(patient: Patient): PatientView {
  return {
    id: patient.id,
    bed: patient.bed,
    name: patient.demographics.name,
    age: patient.demographics.age,
    sex: patient.demographics.sex,
    code: patient.demographics.code,
    complaint: patient.presentingComplaint,
    allergies: [...patient.allergies],
  };
}

function selectChat(
  state: GameState,
  patientId: string,
  env: ViewEnv,
  clockLabel: (t: number) => string,
): ChatView | null {
  const thread = state.chats[patientId];
  if (!thread) return null;
  const names = new Map(thread.present.map((p) => [p.id, p.name]));
  const typing = new Set(typingSpeakerIds(state));
  const lines: ChatLineView[] = thread.lines.map((line) => {
    const base = {
      id: line.id,
      speakerId: line.speaker.id,
      speakerName:
        line.speaker.kind === 'PLAYER'
          ? ''
          : line.speaker.kind === 'PHARMACY'
            ? env.config.gate.pharmacyName
            : (names.get(line.speaker.id) ?? ''),
      timeLabel: clockLabel(line.t),
      orderId: line.orderId,
      source: line.source,
    };
    switch (line.speaker.kind) {
      case 'PLAYER':
        return { ...base, kind: 'PLAYER', text: line.template, systemCode: null };
      case 'SYSTEM':
        return { ...base, kind: 'SYSTEM', text: null, systemCode: line.template };
      default:
        return {
          ...base,
          kind: line.speaker.kind,
          text: renderTemplate(line.template, line.tokenValues),
          systemCode: null,
        };
    }
  });
  const lastLeft = [...thread.visits].reverse().find((v) => v.lineCountAtLeave !== null);
  const divider =
    lastLeft?.lineCountAtLeave !== null &&
    lastLeft?.lineCountAtLeave !== undefined &&
    lastLeft.lineCountAtLeave < lines.length
      ? lastLeft.lineCountAtLeave
      : null;
  return {
    patientId,
    lines,
    present: thread.present.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      mentionName: p.mentionKeys[0] ?? p.name,
      typing: typing.has(p.id),
    })),
    lastLeftDividerIndex: divider,
    unreadSinceLeave: divider === null ? 0 : lines.length - divider,
    playerTextMaxChars: env.config.chat.playerTextMaxChars,
  };
}

function executorName(state: GameState, executor: string | null): string | null {
  if (!executor) return null;
  if (executor === 'sub:1' && state.ward.sub) return state.ward.sub.name;
  for (const thread of Object.values(state.chats)) {
    const found = thread.present.find((p) => p.id === executor);
    if (found) return found.name;
  }
  return null;
}

function selectOrders(
  state: GameState,
  patientId: string,
  env: ViewEnv,
  clockLabel: (t: number) => string,
): OrderRowView[] {
  return Object.values(state.orders)
    .filter((o) => o.patientId === patientId)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id, 'en', { numeric: true }))
    .map((order) => {
      const row = env.tables['order-catalog'].find((r) => r.id === order.catalogId);
      const running = order.status === 'RUNNING' || order.status === 'QUEUED';
      return {
        id: order.id,
        patientId: order.patientId,
        label: composeOrderLabel(row, order),
        status: order.status,
        executorName: executorName(state, order.executor),
        executorKind: order.executorKind,
        timeLabel: clockLabel(order.createdAt),
        // 下屬嘅預計完成時間會洩露速度（資歷），所以唔顯示（B7）
        etaSeconds:
          running && order.executorKind !== 'SUBORDINATE'
            ? Math.max(0, order.completesAt - state.clock.t)
            : null,
        cancellable: isCancellable(order, row),
        resultStatus: order.resultStatus,
        resultText:
          state.actionLog.find((entry) => entry.orderId === order.id && entry.resultText)
            ?.resultText ?? null,
      };
    });
}

function selectGates(state: GameState, patientId: string, env: ViewEnv): GateCardView[] {
  return Object.values(state.orders)
    .filter((o) => o.patientId === patientId && o.status === 'GATED' && o.gate)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id, 'en', { numeric: true }))
    .flatMap((order) => {
      const gate = order.gate;
      if (!gate || gate.phase === 'RELEASED') return [];
      const row = env.tables['order-catalog'].find((r) => r.id === order.catalogId);
      const nurseName = state.chats[patientId]?.present.find((p) => p.kind === 'NURSE')?.name ?? '';
      return [
        {
          orderId: order.id,
          label: composeOrderLabel(row, order),
          phase: gate.phase,
          concerns: gate.reviews.flatMap((review) =>
            review.concerns.map((concern) => ({
              by: review.by,
              byName: review.by === 'PHARMACY' ? env.config.gate.pharmacyName : nurseName,
              category: concern.category,
              text: renderTemplate(concern.line, concern.tokenValues),
            })),
          ),
          insistCount: gate.insistCount,
          required: gate.required,
          canInsist: gate.phase === 'DECISION' || gate.phase === 'RECONFIRM',
        },
      ];
    });
}

function selectReports(patient: Patient, clockLabel: (t: number) => string): ReportView[] {
  return [...patient.visible.reports].reverse().map((report) => ({
    id: report.id,
    orderId: report.orderId,
    label: report.label,
    timeLabel: clockLabel(report.reportedAt),
    kind: report.kind,
    abnormal: report.abnormal,
    items: report.items.map((item) => ({ ...item })),
    text: report.text,
    reviewPending: report.reviewStatus !== 'REVIEWED',
  }));
}

function selectActionLog(
  state: GameState,
  env: ViewEnv,
  clockLabel: (t: number) => string,
): ActionRowView[] {
  return [...state.actionLog].reverse().map((entry) => {
    const order = entry.orderId ? state.orders[entry.orderId] : undefined;
    const row = order
      ? env.tables['order-catalog'].find((r) => r.id === order.catalogId)
      : undefined;
    const patient = entry.patientId ? state.patients[entry.patientId] : undefined;
    return {
      id: entry.id,
      timeLabel: clockLabel(entry.t),
      patientId: entry.patientId,
      bed: patient?.bed ?? null,
      kind: entry.kind,
      label: order ? (presetLabel(order, env.tables) ?? composeOrderLabel(row, order)) : null,
      eventCode: entry.kind === 'EVENT' ? entry.reasonCode : null,
      status: order?.status ?? null,
      executorName: executorName(state, entry.executor),
      reasonCode: entry.kind === 'ORDER' ? entry.reasonCode : null,
      resultText: entry.resultText,
      nurseNote: entry.nurseNote,
    };
  });
}

const RESUS_DRUGS = new Set(['drug.adrenaline', 'drug.amiodarone']);

function chipCategory(type: string, catalogId: string): QuickChipView['category'] {
  if (type === 'RESUSCITATION' || RESUS_DRUGS.has(catalogId)) return 'resus';
  if (type === 'OBSERVATION' || type === 'MONITORING') return 'observe';
  if (type === 'OXYGEN' || type === 'FLUID' || type === 'DRUG') return 'treat';
  if (type === 'PROCEDURE') return 'procedure';
  return 'tests';
}

function presetLabel(
  order: {
    catalogId: string;
    params: { dose: { value: number; unit: string } | null; route: string | null };
  },
  tables: EngineTables,
): string | undefined {
  const hits = tables['quick-words'].filter(
    (word) => word.chipLabel && word.catalogId === order.catalogId,
  );
  const match = hits.find((word) => {
    const dose = word.params?.dose;
    if (dose) {
      return (
        order.params.dose?.value === dose.value &&
        order.params.dose.unit === dose.unit &&
        (word.params?.route ?? null) === order.params.route
      );
    }
    return order.params.dose === null;
  });
  return match?.chipLabel;
}

function selectQuickChips(tables: EngineTables): QuickChipView[] {
  return tables['quick-words'].flatMap((word) => {
    const text = word.aliases[0];
    const row = tables['order-catalog'].find((item) => item.id === word.catalogId);
    return word.chipLabel && text
      ? [
          {
            id: word.id,
            label: word.chipLabel,
            text,
            category: word.chipGroup ?? chipCategory(row?.type ?? '', word.catalogId),
          },
        ]
      : [];
  });
}

export function selectGameView(state: GameState, env: ViewEnv): GameView {
  const clockLabel = (t: number) => formatClock(t, state.mode, env.config);
  const current = state.ward.enabled
    ? (Object.values(state.patients).find((p) => p.bed === state.ward.location.bed) ?? null)
    : (Object.values(state.patients).sort((a, b) => a.bed - b.bed)[0] ?? null);
  const actionLog = selectActionLog(state, env, clockLabel);
  const failedReq =
    state.paused?.by === 'ai-failure' && state.paused.reqId ? state.paused.reqId : null;
  return {
    clock: {
      label: formatClock(state.clock.t, state.mode, env.config),
      seconds: state.clock.t,
      speed: state.clock.speed,
      speeds: [...env.config.clock.speeds],
      paused: state.paused !== null,
      pausedBy: state.paused?.by ?? null,
      cprSlow: state.clock.cprSlow,
      effectiveSpeed: state.clock.cprSlow ? env.config.clock.cprSlowFactor : state.clock.speed,
    },
    patient: current ? selectPatient(current) : null,
    monitor: current ? selectMonitor(current, env, clockLabel) : null,
    chat: current ? selectChat(state, current.id, env, clockLabel) : null,
    orders: current ? selectOrders(state, current.id, env, clockLabel) : [],
    gates: current ? selectGates(state, current.id, env) : [],
    reports: current ? selectReports(current, clockLabel) : [],
    actionLog: {
      all: actionLog,
      patient: current ? actionLog.filter((r) => r.patientId === current.id) : [],
    },
    quickChips: selectQuickChips(env.tables),
    resus: selectResus(state, env, clockLabel),
    death: selectDeath(state, env, clockLabel),
    pendingAiCount: state.pendingAi.length,
    aiFailure: failedReq
      ? {
          reqId: failedReq,
          reason: env.aiFailureReason ?? null,
          detail: env.aiFailureDetail ?? null,
        }
      : null,
    notice: env.notice ?? null,
    ward: selectWard(state, env, clockLabel),
    shift: selectShift(state, env, clockLabel),
  };
}
