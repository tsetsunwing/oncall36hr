/** Layout G DEMO 假數據；唔接狀態機／reducer。 */

export type ZoneId = 'A' | 'B';
export type LandmarkId = 'pantry' | 'rest' | 'wc';
export type DayPart = 'day' | 'night';

export interface Hotspot {
  id: string;
  xPct: number;
  yPct: number;
  mews: number;
  alert?: boolean;
}

/** Hotspots from docs/layout-g-hotspots-2026-11-14.md (1920×1080 → %). */
export const ZONE_A_BEDS: Hotspot[] = [
  { id: 'A1', xPct: 19.8, yPct: 21.3, mews: 1 },
  { id: 'A2', xPct: 29.0, yPct: 21.3, mews: 2 },
  { id: 'A3', xPct: 38.6, yPct: 21.3, mews: 0 },
  { id: 'A4', xPct: 47.5, yPct: 21.3, mews: 3 },
  { id: 'A5', xPct: 56.9, yPct: 21.3, mews: 6, alert: true },
  { id: 'A6', xPct: 65.5, yPct: 21.3, mews: 1 },
  { id: 'A7', xPct: 17.9, yPct: 38.1, mews: 2 },
  { id: 'A8', xPct: 16.2, yPct: 48.3, mews: 4 },
  { id: 'A9', xPct: 14.8, yPct: 59.0, mews: 1 },
  { id: 'A10', xPct: 64.6, yPct: 38.1, mews: 0 },
  { id: 'A11', xPct: 65.2, yPct: 48.3, mews: 5, alert: true },
  { id: 'A12', xPct: 65.7, yPct: 58.5, mews: 2 },
  { id: 'A13', xPct: 30.8, yPct: 69.0, mews: 1 },
  { id: 'A14', xPct: 51.7, yPct: 69.0, mews: 3 },
];

export const ZONE_B_BEDS: Hotspot[] = [
  { id: 'B1', xPct: 30.5, yPct: 32.3, mews: 1 },
  { id: 'B2', xPct: 42.6, yPct: 28.0, mews: 2 },
  { id: 'B3', xPct: 55.2, yPct: 22.9, mews: 7, alert: true },
  { id: 'B4', xPct: 21.7, yPct: 57.0, mews: 0 },
  { id: 'B5', xPct: 62.1, yPct: 48.3, mews: 3 },
];

export const ZONE_A_LANDMARKS: { id: LandmarkId; labelChi: string; labelEng: string; xPct: number; yPct: number }[] = [
  { id: 'pantry', labelChi: '茶水間', labelEng: 'Pantry', xPct: 79.8, yPct: 21.7 },
  { id: 'rest', labelChi: '休息室', labelEng: 'Rest', xPct: 82.9, yPct: 42.9 },
  { id: 'wc', labelChi: '洗手間', labelEng: 'WC', xPct: 85.0, yPct: 64.8 },
];

export const ZONE_B_LANDMARKS: { id: LandmarkId; labelChi: string; labelEng: string; xPct: number; yPct: number }[] = [
  { id: 'pantry', labelChi: '茶水間', labelEng: 'Pantry', xPct: 75.1, yPct: 30.0 },
  { id: 'rest', labelChi: '休息室', labelEng: 'Rest', xPct: 79.2, yPct: 50.5 },
  { id: 'wc', labelChi: '洗手間', labelEng: 'WC', xPct: 73.2, yPct: 68.7 },
];

export const DEMO_CLOCK = { day: '08:42', night: '02:18' } as const;

export const DEMO_NEEDS = {
  fatigue: 48,
  hunger: 30,
  bladder: 62,
} as const;

export const DEMO_PATIENT = {
  id: 'p-a5',
  bedId: 'A5',
  name: '鄧嘉豪',
  age: 58,
  sex: 'M' as const,
  ageGroup: 'adult' as const,
  complaint: '胸悶、氣促',
  artKey: 'bedzoom-4.jpg',
};

export const DEMO_MAR = [
  {
    id: 'mar1',
    route: 'PO',
    drug: 'Paracetamol',
    dose: '1 g',
    freq: 'STAT',
    status: 'Due' as const,
    due: '02:20',
  },
  {
    id: 'mar2',
    route: 'IVF',
    drug: 'Normal Saline',
    dose: '500 mL',
    freq: 'Full Rate STAT',
    status: 'Inf' as const,
    due: 'Infusing',
  },
];

export const DEMO_RESULTS = [
  {
    id: 'cxr',
    group: 'Radiology',
    label: 'CXR [X光 X-Ray]',
    time: '01:40',
    detail: 'Right lower zone consolidation. No pleural effusion or pneumothorax.',
  },
  {
    id: 'abg',
    group: 'POCT',
    label: 'ABG',
    time: '01:51',
    chips: [
      { k: 'pH', v: '7.43', grade: 'N' as const },
      { k: 'pCO₂', v: '4.4', grade: 'N' as const },
      { k: 'pO₂', v: '8.6', grade: 'L' as const },
      { k: 'HCO₃', v: '22.5', grade: 'N' as const },
      { k: 'Lac', v: '2.4', grade: 'H' as const },
    ],
  },
];

export const DEMO_ACTION_LOG = [
  { id: 'al1', time: '01:52', text: '治療 · Normal Saline 500 mL Full Rate STAT' },
  { id: 'al2', time: '01:48', text: '檢查 · CXR' },
  { id: 'al3', time: '01:45', text: '觀察 · 全套生命表徵' },
];

export const DEMO_CHAT = [
  { id: '1', who: '你 You', text: 'A5 床而家點？' },
  { id: '2', who: '張護士 Nurse', text: '仲有啲喘，SpO2 大約 94，我已經加大氧氣。' },
];

export const DEMO_PHONE = {
  seniors: [
    { id: 's1', title: '顧問醫生 Consultant', name: '李顧問', status: '可聯絡' },
    { id: 's2', title: '副顧問 Associate Consultant', name: '陳副顧', status: '稍後' },
  ],
  juniors: [
    { id: 'j1', title: '駐院醫生 Resident', name: '黃醫生', status: '可聯絡' },
    { id: 'j2', title: '實習醫生 Intern', name: '何醫生', status: '響鈴中' },
  ],
  specialties: [
    { id: 'sp1', title: '心臟科 Cardiology', name: '瑪麗醫院', status: '可聯絡' },
    { id: 'sp2', title: '深切治療 ICU', name: '瑪麗醫院', status: '可聯絡' },
    { id: 'sp3', title: '呼吸系統科 Respiratory', name: '瑪麗醫院', status: '稍後' },
  ],
};

export const LANDMARK_ACTIONS: Record<
  LandmarkId,
  { titleChi: string; titleEng: string; actions: { id: string; labelChi: string; labelEng: string; note: string }[] }
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
      { id: 'toilet', labelChi: '如廁', labelEng: 'Use toilet', note: '內急 Bladder → 0' },
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

export const ROUND_QUESTION = {
  bed: 'A5',
  patient: '鄧嘉豪',
  promptChi: '以下邊項最能解釋而家嘅氣促同低血氧？',
  promptEng: 'Which best explains the dyspnoea and hypoxaemia now?',
  choices: [
    { id: 'A', text: 'A. 心衰竭肺水腫 Pulmonary oedema from heart failure' },
    { id: 'B', text: 'B. 社區獲得性肺炎 Community-acquired pneumonia' },
    { id: 'C', text: 'C. 肺栓塞 Pulmonary embolism' },
    { id: 'D', text: 'D. 焦慮過度換氣 Anxiety hyperventilation' },
  ],
  correct: 'B',
  teachingChi: '右下肺實變同發燒傾向肺炎；先繼續氧氣、抗生素同監察。',
  teachingEng: 'Right-lower-zone consolidation with fever favours pneumonia.',
};

export const END_REPORT = {
  grade: 'B+',
  score: 78,
  lines: [
    { labelChi: '反應速度 Response', labelEng: 'Response', value: '良好 Good' },
    { labelChi: '醫囑完整性 Orders', labelEng: 'Orders', value: '尚可 Fair' },
    { labelChi: '溝通 Communication', labelEng: 'Communication', value: '良好 Good' },
    { labelChi: '自我照顧 Self-care', labelEng: 'Self-care', value: '需改善 Needs work' },
  ],
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
