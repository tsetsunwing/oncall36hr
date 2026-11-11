import type {
  ActionRowView,
  ChatLineView,
  ChatView,
  GameView,
  GateCardView,
  MonitorView,
  OrderRowView,
  PatientView,
  ReportView,
  VitalBand,
  VitalReadout,
} from '@/view';

const readout = (
  text: string,
  level: VitalReadout['level'] = 'NORMAL',
  direction: VitalReadout['direction'] = null,
  band: VitalBand = 'normal',
): VitalReadout => ({
  text,
  level,
  direction,
  band,
});

export const patient: PatientView = {
  id: 'p1',
  bed: 7,
  name: '陳大文',
  age: 68,
  sex: 'M',
  code: 'FULL',
  complaint: '氣促',
  allergies: [],
  pain: 6,
  neuro: {
    gcs: { e: 4, v: 5, m: 6, total: 15 },
    pupils: {
      left: { sizeMm: 3, reaction: 'BRISK' },
      right: { sizeMm: 3, reaction: 'BRISK' },
    },
  },
};

export function monitor(over: Partial<MonitorView> = {}): MonitorView {
  return {
    hr: readout('118', 'ALARM', 'HIGH', 'moderate'),
    bp: { ...readout('96/58 (71)', 'CAUTION', 'LOW', 'mild'), sbp: 96, dbp: 58 },
    abp: { ...readout('110/70 (83)', 'NORMAL', null, 'normal'), sbp: 110, dbp: 70 },
    lineSlot: { kind: null, reviewPending: false },
    lines: { abp: false, cvp: false, etco2: false },
    spo2: readout('89', 'ALARM', 'LOW', 'severe'),
    rr: readout('26', 'CAUTION', 'HIGH', 'moderate'),
    temp: readout('38.4', 'CAUTION', 'HIGH', 'moderate'),
    rhythmId: 'SINUS_TACHY',
    rhythmLabel: '竇性心搏過速',
    rhythmAlarm: 'NORMAL',
    pulseless: false,
    waveRate: 118,
    hrValue: 118,
    pulseAmplitude: 0.8,
    wave: null,
    mews: { score: 6, bandId: 'HIGH', level: 'ALARM', components: [], reviewPending: true },
    consciousness: 'A',
    sweepSeconds: 6,
    targetFps: 30,
    asOfLabel: '21:05',
    ...over,
  };
}

const line = (over: Partial<ChatLineView>): ChatLineView => ({
  id: 'l0',
  kind: 'PLAYER',
  speakerId: 'player',
  speakerName: '你',
  text: '你好',
  systemCode: null,
  timeLabel: '21:00',
  orderId: null,
  source: 'BEDSIDE',
  ...over,
});

export function chat(over: Partial<ChatView> = {}): ChatView {
  return {
    patientId: 'p1',
    lines: [
      line({
        id: 'l1',
        kind: 'SYSTEM',
        speakerId: 'n1',
        speakerName: '何姑娘',
        text: null,
        systemCode: 'ARRIVE',
      }),
      line({ id: 'l2', text: '@何姑娘 量血壓' }),
      line({
        id: 'l3',
        kind: 'NURSE',
        speakerId: 'n1',
        speakerName: '何姑娘',
        text: '血壓 96/58，我即刻幫你量。',
      }),
      line({
        id: 'l4',
        kind: 'PATIENT',
        speakerId: 'p1',
        speakerName: '陳大文',
        text: '我好喘呀。',
      }),
    ],
    present: [
      { id: 'n1', kind: 'NURSE', name: '何姑娘', mentionName: '何姑娘', typing: false },
      { id: 'p1', kind: 'PATIENT', name: '陳大文', mentionName: '陳大文', typing: false },
    ],
    lastLeftDividerIndex: null,
    unreadSinceLeave: 0,
    playerTextMaxChars: 300,
    ...over,
  };
}

export function order(over: Partial<OrderRowView> = {}): OrderRowView {
  return {
    id: 'o1',
    patientId: 'p1',
    label: '量度生命表徵',
    status: 'RUNNING',
    executorName: '何姑娘',
    executorKind: 'NURSE',
    timeLabel: '21:01',
    etaSeconds: 120,
    cancellable: true,
    resultStatus: null,
    resultText: null,
    ...over,
  };
}

export const row = (over: Partial<ActionRowView> = {}): ActionRowView => ({
  id: 'a1',
  timeLabel: '21:01',
  patientId: 'p1',
  bed: 7,
  kind: 'ORDER',
  label: '量度生命表徵',
  group: 'observe',
  eventCode: null,
  status: 'DONE',
  executorName: '何姑娘',
  reasonCode: null,
  resultText: 'HR 118',
  nurseNote: null,
  ...over,
});

export function clock(over: Partial<GameView['clock']> = {}): GameView['clock'] {
  return {
    label: '21:05',
    seconds: 300,
    speed: 1,
    speeds: [0, 1, 2, 4],
    paused: false,
    pausedBy: null,
    cprSlow: false,
    effectiveSpeed: 1,
    ...over,
  };
}

export function gate(over: Partial<GateCardView> = {}): GateCardView {
  return {
    orderId: 'o2',
    label: 'Augmentin 1.2 g IV',
    phase: 'DECISION',
    concerns: [
      {
        by: 'PHARMACY',
        byName: '藥房',
        category: 'ALLERGY',
        text: '病人對 Penicillin 過敏，Augmentin 1.2 g IV 有交叉風險。',
      },
      {
        by: 'NURSE',
        byName: '何姑娘',
        category: 'ALLERGY',
        text: '醫生，病人對 Penicillin 過敏，真係要落？',
      },
    ],
    insistCount: 0,
    required: 2,
    canInsist: true,
    ...over,
  };
}

export function report(over: Partial<ReportView> = {}): ReportView {
  return {
    id: 'rep:o3',
    orderId: 'o3',
    label: 'CBC',
    timeLabel: '21:40',
    kind: 'PANEL',
    abnormal: true,
    items: [
      { label: 'WBC', valueText: '18.0 ×10⁹/L', refText: '4.0–10.0', flag: 'H' },
      { label: 'Hb', valueText: '12.5 g/dL', refText: '12.0–16.0', flag: null },
    ],
    text: null,
    reviewPending: true,
    bucket: 'laboratory',
    section: 'haem',
    ...over,
  };
}
