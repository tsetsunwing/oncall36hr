/** Layout G DEMO 假數據；唔接狀態機／reducer。座標跟 Figma 1920×1080 幀。 */

export type ZoneId = 'A' | 'B';
export type LandmarkId = 'pantry' | 'rest' | 'wc';
export type DayPart = 'day' | 'night';
export type MarFilter = 'all' | 'due' | 'inf' | 'reg' | 'prn' | 'given';
export type MarSection = 'due' | 'inf' | 'reg' | 'prn' | 'given';
export type ResultFilter = 'all' | 'labs' | 'radiology' | 'poct';

export interface Hotspot {
  id: string;
  x: number;
  y: number;
  mews: number;
  alert?: boolean;
}

/** Hotspots from docs/layout-g-hotspots + Floor MCP (frame px). */
export const ZONE_A_BEDS: Hotspot[] = [
  { id: 'A1', x: 380, y: 230, mews: 1 },
  { id: 'A2', x: 556, y: 230, mews: 2 },
  { id: 'A3', x: 741, y: 230, mews: 0 },
  { id: 'A4', x: 912, y: 230, mews: 3 },
  { id: 'A5', x: 1093, y: 230, mews: 6, alert: true },
  { id: 'A6', x: 1259, y: 230, mews: 1 },
  { id: 'A7', x: 343, y: 412, mews: 2 },
  { id: 'A8', x: 311, y: 522, mews: 4 },
  { id: 'A9', x: 285, y: 637, mews: 1 },
  { id: 'A10', x: 1241, y: 412, mews: 0 },
  { id: 'A11', x: 1252, y: 522, mews: 5, alert: true },
  { id: 'A12', x: 1262, y: 632, mews: 2 },
  { id: 'A13', x: 592, y: 745, mews: 1 },
  { id: 'A14', x: 993, y: 745, mews: 3 },
];

export const ZONE_B_BEDS: Hotspot[] = [
  { id: 'B1', x: 585, y: 349, mews: 1 },
  { id: 'B2', x: 818, y: 302, mews: 2 },
  { id: 'B3', x: 1059, y: 247, mews: 7, alert: true },
  { id: 'B4', x: 417, y: 616, mews: 0 },
  { id: 'B5', x: 1192, y: 522, mews: 3 },
];

export const ZONE_A_LANDMARKS: {
  id: LandmarkId;
  labelChi: string;
  labelEng: string;
  x: number;
  y: number;
}[] = [
  { id: 'pantry', labelChi: '茶水間', labelEng: 'Pantry', x: 1532, y: 234 },
  { id: 'rest', labelChi: '休息室', labelEng: 'Rest', x: 1592, y: 463 },
  { id: 'wc', labelChi: '洗手間', labelEng: 'WC', x: 1632, y: 700 },
];

export const ZONE_B_LANDMARKS: {
  id: LandmarkId;
  labelChi: string;
  labelEng: string;
  x: number;
  y: number;
}[] = [
  { id: 'pantry', labelChi: '茶水間', labelEng: 'Pantry', x: 1442, y: 324 },
  { id: 'rest', labelChi: '休息室', labelEng: 'Rest', x: 1521, y: 545 },
  { id: 'wc', labelChi: '洗手間', labelEng: 'WC', x: 1405, y: 742 },
];

export const DEMO_CLOCK = { day: '08:42', night: '01:52' } as const;

export const DEMO_NEEDS = {
  fatigue: 62,
  hunger: 41,
  bladder: 28,
} as const;

export const DEMO_PATIENT = {
  id: 'p-a5',
  bedId: 'A5',
  name: '鄧嘉豪',
  age: 85,
  sex: 'M' as const,
  ageGroup: 'elderly' as const,
  sexLabel: '男 Male',
  complaint: '氣喘、痰多 SOB / sputum',
  pmh: '未記錄 Not recorded',
  allergies: '未記錄 Not recorded',
  diagnosis: '未記錄 Not recorded',
  artKey: 'bedzoom-5.jpg',
};

export interface MarRow {
  id: string;
  section: MarSection;
  startDate: string;
  route: 'PO' | 'IV' | 'IVF' | 'IM' | 'SC' | 'NEB' | 'SL';
  routeLabel: string;
  drug: string;
  doseLine: string;
  vetted?: boolean;
  right:
    | { kind: 'due'; time: string }
    | { kind: 'inf'; progress: number }
    | { kind: 'reg'; ticks: { label: string; state: 'given' | 'next' | 'up' | 'cancelled' }[] }
    | { kind: 'prn'; last: string; next: string }
    | { kind: 'given'; time: string };
}

/** MAR v2 sample aligned with Figma catalog demo. */
export const DEMO_MAR: MarRow[] = [
  {
    id: 'mar-para',
    section: 'due',
    startDate: '14/Nov',
    route: 'PO',
    routeLabel: '口服 PO',
    drug: 'Paracetamol tablet',
    doseLine: '1 g STAT',
    vetted: true,
    right: { kind: 'due', time: '01:45' },
  },
  {
    id: 'mar-ns',
    section: 'inf',
    startDate: '14/Nov',
    route: 'IVF',
    routeLabel: '輸液 IVF',
    drug: 'Normal Saline',
    doseLine: '500 mL Full Rate STAT',
    vetted: true,
    right: { kind: 'inf', progress: 0.42 },
  },
  {
    id: 'mar-cef',
    section: 'reg',
    startDate: '14/Nov',
    route: 'IV',
    routeLabel: '靜注 IV',
    drug: 'Ceftriaxone',
    doseLine: '1 g q24h',
    vetted: true,
    right: {
      kind: 'reg',
      ticks: [
        { label: '20:00', state: 'given' },
        { label: '08:00', state: 'next' },
        { label: '明 08:00', state: 'up' },
      ],
    },
  },
  {
    id: 'mar-morph',
    section: 'prn',
    startDate: '14/Nov',
    route: 'IV',
    routeLabel: '靜注 IV',
    drug: 'Morphine',
    doseLine: '2.5 mg PRN',
    vetted: true,
    right: { kind: 'prn', last: '00:00', next: '02:40' },
  },
  {
    id: 'mar-amlod',
    section: 'given',
    startDate: '14/Nov',
    route: 'PO',
    routeLabel: '口服 PO',
    drug: 'Amlodipine',
    doseLine: '5 mg nocte',
    vetted: true,
    right: { kind: 'given', time: '22:40' },
  },
];

export interface ResultChip {
  k: string;
  v: string;
  grade: 'N' | 'H' | 'L';
  latest?: boolean;
}
export type ResultRow =
  | {
      id: string;
      kind: 'group';
      filter: ResultFilter;
      badge: string;
      badgeKind: 'haem' | 'biochem' | 'xray' | 'poct';
      title: string;
      items: { id: string; label: string; ref: string; chips: ResultChip[] }[];
    }
  | {
      id: string;
      kind: 'standalone';
      filter: ResultFilter;
      badge: string;
      badgeKind: 'haem' | 'biochem' | 'xray' | 'poct';
      title: string;
      time?: string;
      detail?: string;
      chips?: ResultChip[];
      ref?: string;
    };

export const DEMO_RESULTS: ResultRow[] = [
  {
    id: 'cbc',
    kind: 'group',
    filter: 'labs',
    badge: '血液 Haem',
    badgeKind: 'haem',
    title: 'CBC 全血圖',
    items: [
      {
        id: 'hb',
        label: 'Hb 血紅蛋白',
        ref: '13.0–17.0 g/dL',
        chips: [
          { k: '', v: '13.8', grade: 'N' },
          { k: '', v: '13.1', grade: 'N' },
          { k: '', v: '12.5', grade: 'N' },
          { k: '', v: '11.9', grade: 'L' },
          { k: '', v: '10.8', grade: 'L', latest: true },
        ],
      },
      {
        id: 'wbc',
        label: 'WBC 白血球',
        ref: '4.0–11.0 10⁹/L',
        chips: [
          { k: '', v: '12.1', grade: 'H' },
          { k: '', v: '13.8', grade: 'H' },
          { k: '', v: '15.2', grade: 'H', latest: true },
        ],
      },
    ],
  },
  {
    id: 'glu',
    kind: 'standalone',
    filter: 'poct',
    badge: '床邊 POCT',
    badgeKind: 'poct',
    title: 'Glucose 血糖',
    chips: [
      { k: '', v: '7.9', grade: 'H' },
      { k: '', v: '8.2', grade: 'H', latest: true },
    ],
    ref: '4.0–7.8',
  },
  {
    id: 'cxr',
    kind: 'standalone',
    filter: 'radiology',
    badge: 'X光 X-Ray',
    badgeKind: 'xray',
    title: 'CXR',
    time: '01:40',
    detail: 'Right lower zone consolidation. No pleural effusion or pneumothorax.',
  },
  {
    id: 'abg',
    kind: 'standalone',
    filter: 'poct',
    badge: '床邊 POCT',
    badgeKind: 'poct',
    title: 'ABG 動脈血氣',
    time: '01:51',
    chips: [
      { k: 'pH', v: '7.43', grade: 'N', latest: true },
      { k: 'pCO₂', v: '4.4', grade: 'L', latest: true },
      { k: 'pO₂', v: '8.6', grade: 'L', latest: true },
      { k: 'HCO₃', v: '22.5', grade: 'N', latest: true },
      { k: 'Lac', v: '2.4', grade: 'H', latest: true },
    ],
  },
];

export const DEMO_ACTION_LOG = [
  {
    id: 'al1',
    time: '01:52',
    text: '治療 · Normal Saline 500 mL Full Rate STAT',
    status: '已開立 ORDERED',
  },
  { id: 'al2', time: '01:48', text: '檢查 · CXR', status: '已開立 ORDERED' },
  { id: 'al3', time: '01:45', text: '觀察 · 全套生命表徵', status: '已開立 ORDERED' },
];

export const DEMO_CHAT = [
  { id: '1', who: '你 You', text: 'A5 床而家點？' },
  { id: '2', who: '張護士 Nurse', text: '仲有啲喘，SpO2 大約 94，我已經加大氧氣。' },
];

/** Marker % inside Diagram Stage (Figma Body Diagram Card 42:497). */
export const DEMO_BODY_MARKERS: {
  id: string;
  label: string;
  x: number;
  y: number;
  tone: 'purple' | 'teal' | 'amber' | 'blue' | 'red';
}[] = [
  { id: 'nrbm', label: 'NRBM', x: 47, y: 7, tone: 'blue' },
  { id: 'ng', label: 'NG', x: 62, y: 15, tone: 'teal' },
  { id: 'cvc', label: 'CVC', x: 48, y: 19, tone: 'purple' },
  { id: 'chest', label: 'Chest tube', x: 34, y: 30, tone: 'amber' },
  { id: 'iv', label: 'IV', x: 32, y: 40, tone: 'purple' },
  { id: 'drain', label: 'Drain', x: 56, y: 39, tone: 'amber' },
  { id: 'art', label: 'Arterial line', x: 60, y: 42, tone: 'red' },
  { id: 'foley', label: 'Foley', x: 47, y: 50, tone: 'teal' },
  { id: 'io', label: 'IO', x: 44, y: 68, tone: 'purple' },
];

export const DEMO_NEURO = [
  { id: 'pain', label: '疼痛 Pain', value: '未評估 Not assessed' },
  { id: 'agitation', label: '煩躁 Agitation', value: '未評估 Not assessed' },
  { id: 'nausea', label: '噁心 Nausea', value: '未評估 Not assessed' },
  { id: 'gcs', label: '昏迷指數 GCS', value: '15 · E4 V5 M6' },
  { id: 'pupils', label: '瞳孔 Pupils', value: '左 L 3mm 靈敏 Brisk · 右 R 3mm 靈敏 Brisk' },
];

export type PhoneTab = 'seniors' | 'juniors' | 'specialties';
export type PhoneChatKey = 'senior' | 'specialty';

export interface PhoneContact {
  id: string;
  name: string;
  subtitle: string;
  initial: string;
  color: string;
  kind: 'senior' | 'junior' | 'specialty';
  chatKey: PhoneChatKey;
}

/** Figma 07 Phone contacts (35:815). */
export const DEMO_PHONE_CONTACTS: Record<PhoneTab, PhoneContact[]> = {
  specialties: [
    {
      id: 'med',
      name: '內科 Medicine',
      subtitle: '專科當值 Specialty on-call',
      initial: '內',
      color: '#4073bf',
      kind: 'specialty',
      chatKey: 'specialty',
    },
    {
      id: 'surg',
      name: '外科 Surgery',
      subtitle: '專科當值 Specialty on-call',
      initial: '外',
      color: '#598cb2',
      kind: 'specialty',
      chatKey: 'specialty',
    },
    {
      id: 'icu',
      name: 'ICU',
      subtitle: '危重護理 Critical care',
      initial: 'I',
      color: '#b24d59',
      kind: 'specialty',
      chatKey: 'specialty',
    },
    {
      id: 'cardio',
      name: '心臟科 Cardiology',
      subtitle: '專科當值 Specialty on-call',
      initial: '心',
      color: '#bf5973',
      kind: 'specialty',
      chatKey: 'specialty',
    },
  ],
  seniors: [
    {
      id: 'chan',
      name: 'Dr Chan',
      subtitle: 'SMO · Senior',
      initial: 'D',
      color: '#4d8073',
      kind: 'senior',
      chatKey: 'senior',
    },
    {
      id: 'lam',
      name: 'Dr Lam',
      subtitle: '副顧問 Assoc Cons',
      initial: 'D',
      color: '#4d738c',
      kind: 'senior',
      chatKey: 'senior',
    },
  ],
  juniors: [
    {
      id: 'wong',
      name: 'HO Wong',
      subtitle: '住院醫生 House officer',
      initial: 'H',
      color: '#8c8059',
      kind: 'junior',
      chatKey: 'senior',
    },
    {
      id: 'lee',
      name: 'Intern Lee',
      subtitle: '實習醫生 Intern',
      initial: 'I',
      color: '#80738c',
      kind: 'junior',
      chatKey: 'senior',
    },
  ],
};

/** Legacy tab shape kept for any older callers. */
export const DEMO_PHONE = {
  seniors: DEMO_PHONE_CONTACTS.seniors.map((c) => ({
    id: c.id,
    title: c.subtitle,
    name: c.name,
    status: '可聯絡',
  })),
  juniors: DEMO_PHONE_CONTACTS.juniors.map((c) => ({
    id: c.id,
    title: c.subtitle,
    name: c.name,
    status: '可聯絡',
  })),
  specialties: DEMO_PHONE_CONTACTS.specialties.map((c) => ({
    id: c.id,
    title: c.name,
    name: c.subtitle,
    status: '可聯絡',
  })),
};

/** Figma 08 / 08b WhatsApp-style threads. */
export const DEMO_PHONE_CHATS: Record<
  PhoneChatKey,
  { id: string; dir: 'in' | 'out'; text: string; time: string }[]
> = {
  senior: [
    {
      id: 's1',
      dir: 'out',
      text: '陳醫生，Bed A5 氣促，SpO₂ 92%，想請示要唔要升 NIV？',
      time: '01:50',
    },
    {
      id: 's2',
      dir: 'in',
      text: '先 NRBM 15L，重做 ABG，半小時後再報我。',
      time: '01:51',
    },
    { id: 's3', dir: 'out', text: '收到，而家落 ABG + 升氧。', time: '01:51' },
  ],
  specialty: [
    {
      id: 'p1',
      dir: 'out',
      text: '心臟科當值嗎？Bed A5 喘咳，想問要唔要床邊 Echo？',
      time: '01:52',
    },
    {
      id: 'p2',
      dir: 'in',
      text: '可以，我 10 分鐘到。先做 ECG + 心電監護。',
      time: '01:53',
    },
    { id: 'p3', dir: 'out', text: '收到，謝謝。', time: '01:53' },
  ],
};

export const LANDMARK_ACTIONS: Record<
  LandmarkId,
  {
    titleChi: string;
    titleEng: string;
    actions: { id: string; labelChi: string; labelEng: string; note: string }[];
  }
> = {
  pantry: {
    titleChi: '茶水間',
    titleEng: 'Pantry',
    actions: [
      { id: 'water', labelChi: '喝水', labelEng: 'Drink water', note: '飢餓 Hunger −' },
      { id: 'snack', labelChi: '小食', labelEng: 'Snack', note: '飢餓 Hunger −−' },
      { id: 'coffee', labelChi: '咖啡', labelEng: 'Coffee', note: '疲倦慢 · 內急快' },
    ],
  },
  rest: {
    titleChi: '休息室',
    titleEng: 'Rest room',
    actions: [
      { id: 'sit', labelChi: '坐下休息', labelEng: 'Sit and rest', note: '疲倦 Fatigue −' },
      { id: 'nap', labelChi: '小睡', labelEng: 'Nap', note: '疲倦 −− · 時間 +' },
      { id: 'stretch', labelChi: '伸展', labelEng: 'Stretch', note: '疲倦 Fatigue −' },
    ],
  },
  wc: {
    titleChi: '洗手間',
    titleEng: 'Washroom',
    actions: [
      { id: 'toilet', labelChi: '如廁', labelEng: 'Use toilet', note: '內急 Urgency → 0' },
      { id: 'wash', labelChi: '洗手', labelEng: 'Wash hands', note: '—' },
      { id: 'change', labelChi: '更衣', labelEng: 'Change clothes', note: '時間 +' },
    ],
  },
};

/** Demo formulary slice for DrugOrderForm reuse. */
export const DEMO_MEDICATIONS = [
  {
    id: 'paracetamol',
    label: 'Paracetamol',
    stem: 'paracetamol',
    catalogId: 'drug.paracetamol',
    classes: ['ANALGESICS'],
  },
  {
    id: 'ceftriaxone',
    label: 'Ceftriaxone',
    stem: 'ceftriaxone',
    catalogId: 'drug.ceftriaxone',
    classes: ['ANTIBACTERIAL DRUGS'],
  },
  {
    id: 'furosemide',
    label: 'Furosemide',
    stem: 'furosemide',
    catalogId: 'drug.furosemide',
    classes: ['DIURETICS'],
  },
  {
    id: 'adrenaline',
    label: 'Adrenaline',
    stem: 'adrenaline',
    catalogId: 'drug.adrenaline',
    classes: ['CARDIOVASCULAR DRUGS'],
  },
];

/** Figma 05 Doctor Round copy (161:517 / 161:566). */
export const ROUND_QUESTION = {
  bed: 'A5',
  bedLabel: '3 號床',
  patient: '王淑芬',
  mews: 3,
  promptChi: '這位病人出現氣促惡化，你會先檢查什麼？又會如何分辨心源性與肺源性原因？',
  promptEng: 'Dyspnoea worsening — first checks and cardiac vs pulmonary?',
  choices: [
    { id: 'A', text: '床邊 ECG＋BNP，再看下肢水腫與靜脈壓' },
    { id: 'B', text: '即刻照 Chest X-ray 就夠' },
    { id: 'C', text: '抽血驗 CBC，等報告再決定' },
    { id: 'D', text: '先試利尿劑，有效就是心源性' },
  ],
  correct: 'A',
  hit: '分辨心源／肺源要靠體征＋BNP＋CXR 三線證據',
  miss: '記得評估容量狀態與利尿反應',
  scoring: '計分：答對計入「臨床結果」；不作答或答錯會扣少許分。',
  teachingChi: '分辨心源／肺源要靠體征＋BNP＋CXR 三線證據',
  teachingEng: 'Cardiac vs pulmonary needs signs + BNP + CXR.',
};

export type EndTone = 'teal' | 'warn' | 'ok' | 'bad';

/** Figma 99 End grade rows (136:583). */
export const END_GRADE_ROWS: {
  id: string;
  title: string;
  detail: string;
  grade: string;
  filled: number;
  tone: EndTone;
}[] = [
  {
    id: 'clinical',
    title: '臨床結果 Clinical outcome',
    detail: '及時升氧並重做 ABG；早期敗血症處理 ×2',
    grade: '良好 GOOD',
    filled: 3,
    tone: 'teal',
  },
  {
    id: 'time',
    title: '時效 Timeliness',
    detail: '3 號床降鉀比理想遲 40 分鐘；即時處理來電 ×3',
    grade: '尚可 FAIR',
    filled: 2,
    tone: 'warn',
  },
  {
    id: 'safety',
    title: '安全 Safety',
    detail: '藥物安全把關全過 ×5；PRN 間隔全部守足',
    grade: '優秀 EXCELLENT',
    filled: 4,
    tone: 'ok',
  },
  {
    id: 'comms',
    title: '溝通 Communication',
    detail: '向 SMO 請示清晰 ×2；5 號床未向家屬交代',
    grade: '良好 GOOD',
    filled: 3,
    tone: 'teal',
  },
  {
    id: 'prio',
    title: '優先次序 Prioritisation',
    detail: '警報病人全部即時到床邊',
    grade: '良好 GOOD',
    filled: 3,
    tone: 'teal',
  },
  {
    id: 'self',
    title: '自我照顧 Self-care',
    detail: '交更時疲倦偏高；未進食晚餐',
    grade: '需改善 NEEDS IMPROVEMENT',
    filled: 1,
    tone: 'bad',
  },
];

export const END_OUTCOMES: {
  id: string;
  name: string;
  status: string;
  tag: string;
  tone: EndTone;
  tagTone: EndTone;
}[] = [
  {
    id: 'p3',
    name: '3 號床 王淑芬',
    status: '穩定 STABLE',
    tag: '已交班',
    tone: 'ok',
    tagTone: 'teal',
  },
  {
    id: 'p5',
    name: '5 號床 黃偉傑',
    status: '死亡 DECEASED',
    tag: '已盡力',
    tone: 'bad',
    tagTone: 'warn',
  },
  {
    id: 'p7',
    name: '7 號床 林雅婷',
    status: '需留意 CAUTION',
    tag: '已交班',
    tone: 'warn',
    tagTone: 'teal',
  },
  {
    id: 'p8',
    name: '8 號床 吳家輝',
    status: '穩定 STABLE',
    tag: '未提及',
    tone: 'ok',
    tagTone: 'bad',
  },
];

export const END_STATS = [
  '巡房：答對 6 題，作答 7 / 8 題',
  '超時 0 分鐘 · 於正常時間內交更',
  '藥物安全（AI 評語）：良好',
];

/** Compact legacy shape for any older callers. */
export const END_REPORT = {
  grade: '良好 GOOD',
  score: '—',
  lines: END_GRADE_ROWS.map((r) => ({
    labelChi: r.title.split(' ')[0] ?? r.title,
    labelEng: r.title,
    value: r.grade,
  })),
};

export function mewsTone(mews: number): 'green' | 'amber' | 'red' {
  if (mews >= 5) return 'red';
  if (mews >= 3) return 'amber';
  return 'green';
}

export function bedsFor(zone: ZoneId): Hotspot[] {
  return zone === 'A' ? ZONE_A_BEDS : ZONE_B_BEDS;
}

export function landmarksFor(zone: ZoneId) {
  return zone === 'A' ? ZONE_A_LANDMARKS : ZONE_B_LANDMARKS;
}

export function marFilterMatch(row: MarRow, filter: MarFilter): boolean {
  if (filter === 'all') return true;
  return row.section === filter;
}
