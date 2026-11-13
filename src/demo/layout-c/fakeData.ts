/** Concept C layout DEMO 假數據；唔接狀態機。 */

export const DEMO_CLOCK = '02:18';

export const DEMO_NEEDS = {
  fatigue: 48,
  hunger: 30,
  bladder: 62,
} as const;

export const DEMO_BEDS = [
  { bed: 1, mews: 1, level: 'NORMAL' as const, name: '陳大文' },
  { bed: 2, mews: 2, level: 'NORMAL' as const, name: '李美玲' },
  { bed: 3, mews: 3, level: 'CAUTION' as const, name: '王淑芬' },
  { bed: 4, mews: 1, level: 'NORMAL' as const, name: '張志強' },
  { bed: 5, mews: 4, level: 'ALARM' as const, name: '黃偉傑' },
  { bed: 6, mews: 0, level: 'NORMAL' as const, name: null },
  { bed: 7, mews: 2, level: 'NORMAL' as const, name: '林雅婷' },
  { bed: 8, mews: 1, level: 'NORMAL' as const, name: '吳家輝' },
];

export const DEMO_PATIENT = {
  bed: 3,
  name: '王淑芬',
  age: 62,
  sex: '女',
  complaint: '胸悶、氣促',
};

export const DEMO_VITALS = {
  hr: 92,
  rr: 18,
  spo2: 96,
  nibp: '118/76',
  map: 90,
};

export const DEMO_LINES = [
  { id: 'o2', label: '氧氣鼻導管 2 L/min', at: 'nose' },
  { id: 'iv', label: '周邊靜脈輸液', at: 'arm' },
  { id: 'foley', label: '導尿管（Foley）', at: 'pelvis' },
] as const;

export const DEMO_REPORTS = [
  { id: 'cbc', label: 'CBC', status: 'PENDING' as const, detail: '進行中' },
  { id: 'cxr', label: 'CXR', status: 'REPORTED' as const, detail: '已報告' },
  { id: 'abg', label: 'ABG', status: 'REPORTED' as const, detail: '已報告' },
];

export const DEMO_CHAT = [
  { id: '1', who: '張護士', text: '3 床話有啲胸悶，血壓有少少波動，你過嚟睇下？' },
  { id: '2', who: '你', text: '收到，我而家過去。' },
];

export const DEMO_CALL = {
  from: '護理站',
  ext: '205',
  text: '詢問 3 號床狀況',
};

export const DEMO_CALLS = [
  {
    id: 'c1',
    tag: '護士',
    who: '張護士',
    status: '響鈴中',
    text: '3 床胸悶，請過來評估。',
    time: '02:16',
  },
  {
    id: 'c2',
    tag: '家屬',
    who: '王太',
    status: '稍後',
    text: '想知今晚情況。',
    time: '01:58',
  },
];

export type LandmarkId = 'PANTRY' | 'REST' | 'WC';

export const LANDMARKS: Record<
  LandmarkId,
  { title: string; hint: string; actions: { id: string; label: string; note: string }[] }
> = {
  PANTRY: {
    title: '茶水間',
    hint: '減低飢餓；咖啡短暫減慢疲倦上升，但內急加快。',
    actions: [
      { id: 'water', label: '喝水', note: '飢餓 −' },
      { id: 'coffee', label: '咖啡', note: '飢餓 − · 疲倦慢 · 內急快' },
    ],
  },
  REST: {
    title: '休息室',
    hint: '減低疲倦，每次扣一段遊戲時間。',
    actions: [
      { id: 'sit', label: '坐下休息', note: '疲倦 − · 時間 +' },
      { id: 'nap', label: '小睡', note: '疲倦 −− · 時間 ++' },
    ],
  },
  WC: {
    title: '洗手間',
    hint: '減低內急。',
    actions: [{ id: 'toilet', label: '如廁', note: '內急歸零' }],
  },
};
