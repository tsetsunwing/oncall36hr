import type {
  ActionRowView,
  ChatLineView,
  ChatView,
  GameView,
  MonitorView,
  OrderRowView,
  PatientView,
  VitalReadout,
} from '@/view';

const readout = (
  text: string,
  level: VitalReadout['level'] = 'NORMAL',
  direction: VitalReadout['direction'] = null,
): VitalReadout => ({
  text,
  level,
  direction,
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
};

export function monitor(over: Partial<MonitorView> = {}): MonitorView {
  return {
    hr: readout('118', 'ALARM', 'HIGH'),
    bp: { ...readout('96/58', 'CAUTION', 'LOW'), sbp: 96, dbp: 58 },
    map: readout('71'),
    spo2: readout('89', 'ALARM', 'LOW'),
    rr: readout('26', 'CAUTION', 'HIGH'),
    temp: readout('38.4', 'CAUTION', 'HIGH'),
    rhythmId: 'SINUS_TACHY',
    rhythmLabel: '竇性心搏過速',
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
    timeLabel: '21:01',
    etaSeconds: 120,
    cancellable: true,
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
    ...over,
  };
}
