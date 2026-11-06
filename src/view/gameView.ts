/**
 * ViewModel 選擇器（implementation-plan §3、§4.2）：GameState → UI 可顯示嘅唯讀資料。
 * 只映射 `patient.visible`、聊天、order、log；`patient.hidden`（診斷、FSM 狀態、base 值）永遠唔會出現。
 * 所有顯示數值都係 engine 狀態；AI 文字只會經 engine 寫入嘅 ChatLine（已過 numeric guard）出現。
 */
import {
  abnormalOf,
  composeOrderLabel,
  CANCELLABLE_STATUSES,
  meanArterialPressure,
  renderTemplate,
  typingSpeakerIds,
  type EngineTables,
  type GameState,
  type MewsComponentKey,
  type Patient,
} from '@/engine';
import { formatClock, type ShiftClockConfig } from './clock';
import type {
  ActionRowView,
  AlarmLevel,
  ChatLineView,
  ChatView,
  Direction,
  GameView,
  MonitorView,
  OrderRowView,
  PatientView,
  QuickChipView,
  VitalReadout,
} from './types';
import { parseWave, plethAmplitude } from './waveform';

export interface ViewEnv {
  tables: EngineTables;
  config: ShiftClockConfig & {
    clock: { speeds: readonly number[] };
    chat: { playerTextMaxChars: number };
    ui: { monitor: { sweepSeconds: number; targetFps: number } };
  };
  aiFailureReason?: string | null;
}

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

function readout(text: string, level: AlarmLevel, direction: Direction): VitalReadout {
  return { text, level, direction };
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
  const hr = component('hr');
  const sbp = component('sbp');
  const spo2 = component('spo2');
  const rr = component('rr');
  const temp = component('temp');
  return {
    hr: { ...hr, text: String(v.hr) },
    bp: { ...sbp, text: `${String(v.sbp)}/${String(v.dbp)}`, sbp: v.sbp, dbp: v.dbp },
    map: readout(String(meanArterialPressure(v.sbp, v.dbp)), 'NORMAL', null),
    spo2: { ...spo2, text: String(v.spo2) },
    rr: { ...rr, text: String(v.rr) },
    temp: { ...temp, text: v.temp.toFixed(1) },
    rhythmId: patient.visible.rhythm,
    rhythmLabel: rhythm?.label ?? patient.visible.rhythm,
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
      speakerName: line.speaker.kind === 'PLAYER' ? '' : (names.get(line.speaker.id) ?? ''),
      timeLabel: clockLabel(line.t),
      orderId: line.orderId,
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
        timeLabel: clockLabel(order.createdAt),
        etaSeconds: running ? Math.max(0, order.completesAt - state.clock.t) : null,
        cancellable:
          CANCELLABLE_STATUSES.includes(order.status) &&
          (row?.cancelWhile.includes(order.status as 'QUEUED' | 'RUNNING') ?? false),
      };
    });
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
      label: order ? composeOrderLabel(row, order) : null,
      eventCode: entry.kind === 'EVENT' ? entry.reasonCode : null,
      status: order?.status ?? null,
      executorName: executorName(state, entry.executor),
      reasonCode: entry.kind === 'ORDER' ? entry.reasonCode : null,
      resultText: entry.resultText,
      nurseNote: entry.nurseNote,
    };
  });
}

function selectQuickChips(tables: EngineTables): QuickChipView[] {
  return tables['quick-words'].flatMap((word) => {
    const text = word.aliases[0];
    return word.chipLabel && text ? [{ id: word.id, label: word.chipLabel, text }] : [];
  });
}

export function selectGameView(state: GameState, env: ViewEnv): GameView {
  const clockLabel = (t: number) => formatClock(t, state.mode, env.config);
  const current = Object.values(state.patients).sort((a, b) => a.bed - b.bed)[0] ?? null;
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
    },
    patient: current ? selectPatient(current) : null,
    monitor: current ? selectMonitor(current, env, clockLabel) : null,
    chat: current ? selectChat(state, current.id, env, clockLabel) : null,
    orders: current ? selectOrders(state, current.id, env, clockLabel) : [],
    actionLog: {
      all: actionLog,
      patient: current ? actionLog.filter((r) => r.patientId === current.id) : [],
    },
    quickChips: selectQuickChips(env.tables),
    pendingAiCount: state.pendingAi.length,
    aiFailure: failedReq ? { reqId: failedReq, reason: env.aiFailureReason ?? null } : null,
  };
}
