/**
 * 病房清單（值層）。只放代碼同名字，唔放邏輯。
 * 命名規則：Ward 類英文加 "Ward"、中文加「病房」；Unit 類唔加（ICU／CCU／HDU／NICU／PICU／SCBU／ASU／AED）。
 * phase 1 ＝ 今個階段會出現嘅病房；其餘係日後擴充，遊戲唔會開。
 */
export type WardKind = 'WARD' | 'UNIT';

export interface WardDef {
  code: string;
  kind: WardKind;
  en: string;
  zh: string;
  phase: 1 | 2;
}

export const WARD_LIST: readonly WardDef[] = [
  { code: 'MED', kind: 'WARD', en: 'General Medicine Ward', zh: '內科病房', phase: 1 },
  { code: 'SRG', kind: 'WARD', en: 'General Surgery Ward', zh: '外科病房', phase: 1 },
  { code: 'CARD', kind: 'WARD', en: 'Cardiology Ward', zh: '心臟科病房', phase: 2 },
  { code: 'RESP', kind: 'WARD', en: 'Respiratory Ward', zh: '呼吸科病房', phase: 2 },
  { code: 'GI', kind: 'WARD', en: 'Gastroenterology Ward', zh: '腸胃科病房', phase: 2 },
  { code: 'ENDO', kind: 'WARD', en: 'Endocrinology Ward', zh: '內分泌科病房', phase: 2 },
  { code: 'REN', kind: 'WARD', en: 'Nephrology Ward', zh: '腎科病房', phase: 2 },
  { code: 'NEU', kind: 'WARD', en: 'Neurology Ward', zh: '腦神經科病房', phase: 2 },
  { code: 'HAEM', kind: 'WARD', en: 'Haematology Ward', zh: '血液科病房', phase: 2 },
  { code: 'ONC', kind: 'WARD', en: 'Oncology Ward', zh: '腫瘤科病房', phase: 2 },
  { code: 'RHE', kind: 'WARD', en: 'Rheumatology Ward', zh: '風濕科病房', phase: 2 },
  { code: 'ID', kind: 'WARD', en: 'Infectious Disease Ward', zh: '感染科病房', phase: 2 },
  { code: 'GER', kind: 'WARD', en: 'Geriatrics Ward', zh: '老人科病房', phase: 2 },
  { code: 'DERM', kind: 'WARD', en: 'Dermatology Ward', zh: '皮膚科病房', phase: 2 },
  { code: 'REHAB', kind: 'WARD', en: 'Rehabilitation Ward', zh: '復康病房', phase: 2 },
  { code: 'PALL', kind: 'WARD', en: 'Palliative Care Ward', zh: '紓緩治療病房', phase: 2 },
  { code: 'CRS', kind: 'WARD', en: 'Colorectal Surgery Ward', zh: '大腸直腸外科病房', phase: 2 },
  {
    code: 'HBP',
    kind: 'WARD',
    en: 'Hepatobiliary and Pancreatic Surgery Ward',
    zh: '肝膽胰外科病房',
    phase: 2,
  },
  {
    code: 'EGI',
    kind: 'WARD',
    en: 'Upper Gastrointestinal Surgery Ward',
    zh: '上消化道外科病房',
    phase: 2,
  },
  { code: 'BR', kind: 'WARD', en: 'Breast Surgery Ward', zh: '乳腺外科病房', phase: 2 },
  { code: 'VAS', kind: 'WARD', en: 'Vascular Surgery Ward', zh: '血管外科病房', phase: 2 },
  { code: 'NS', kind: 'WARD', en: 'Neurosurgery Ward', zh: '腦外科病房', phase: 2 },
  { code: 'CTS', kind: 'WARD', en: 'Cardiothoracic Surgery Ward', zh: '心胸外科病房', phase: 2 },
  { code: 'URO', kind: 'WARD', en: 'Urology Ward', zh: '泌尿科病房', phase: 2 },
  {
    code: 'ORT',
    kind: 'WARD',
    en: 'Orthopaedics and Traumatology Ward',
    zh: '骨科病房',
    phase: 2,
  },
  { code: 'PRS', kind: 'WARD', en: 'Plastic Surgery Ward', zh: '整形外科病房', phase: 2 },
  { code: 'PS', kind: 'WARD', en: 'Paediatric Surgery Ward', zh: '小兒外科病房', phase: 2 },
  { code: 'TXP', kind: 'WARD', en: 'Transplant Ward', zh: '移植病房', phase: 2 },
  { code: 'BURN', kind: 'WARD', en: 'Burns Ward', zh: '燒傷病房', phase: 2 },
  { code: 'ISO', kind: 'WARD', en: 'Isolation Ward', zh: '隔離病房', phase: 2 },
  { code: 'OBS', kind: 'WARD', en: 'Obstetrics Ward', zh: '產科病房', phase: 2 },
  { code: 'GYN', kind: 'WARD', en: 'Gynaecology Ward', zh: '婦科病房', phase: 2 },
  { code: 'LW', kind: 'WARD', en: 'Labour Ward', zh: '產房', phase: 2 },
  { code: 'ANTE', kind: 'WARD', en: 'Antenatal Ward', zh: '產前病房', phase: 2 },
  { code: 'POST', kind: 'WARD', en: 'Postnatal Ward', zh: '產後病房', phase: 2 },
  {
    code: 'GONC',
    kind: 'WARD',
    en: 'Gynaecological Oncology Ward',
    zh: '婦科腫瘤科病房',
    phase: 2,
  },
  { code: 'PAED', kind: 'WARD', en: 'Paediatrics Ward', zh: '兒科病房', phase: 2 },
  { code: 'PSY', kind: 'WARD', en: 'Psychiatry Ward', zh: '精神科病房', phase: 2 },
  { code: 'PSYGER', kind: 'WARD', en: 'Psychogeriatric Ward', zh: '老年精神科病房', phase: 2 },
  { code: 'OPH', kind: 'WARD', en: 'Ophthalmology Ward', zh: '眼科病房', phase: 2 },
  { code: 'ENT', kind: 'WARD', en: 'Ear, Nose and Throat Ward', zh: '耳鼻喉科病房', phase: 2 },
  { code: 'EMW', kind: 'WARD', en: 'Emergency Medical Ward', zh: '急症內科病房', phase: 2 },
  { code: 'DAY', kind: 'WARD', en: 'Day Ward', zh: '日間病房', phase: 2 },
  { code: 'PVT', kind: 'WARD', en: 'Private Ward', zh: '私家病房', phase: 2 },
  { code: 'ICU', kind: 'UNIT', en: 'Intensive Care Unit', zh: '深切治療部', phase: 2 },
  { code: 'CCU', kind: 'UNIT', en: 'Coronary Care Unit', zh: '冠心病深切治療部', phase: 2 },
  { code: 'HDU', kind: 'UNIT', en: 'High Dependency Unit', zh: '加護病房', phase: 2 },
  {
    code: 'NICU',
    kind: 'UNIT',
    en: 'Neonatal Intensive Care Unit',
    zh: '初生嬰兒深切治療部',
    phase: 2,
  },
  {
    code: 'PICU',
    kind: 'UNIT',
    en: 'Paediatric Intensive Care Unit',
    zh: '兒童深切治療部',
    phase: 2,
  },
  { code: 'SCBU', kind: 'UNIT', en: 'Special Care Baby Unit', zh: '特別護理嬰兒部', phase: 2 },
  { code: 'ASU', kind: 'UNIT', en: 'Acute Stroke Unit', zh: '急性中風部', phase: 2 },
  { code: 'AED', kind: 'UNIT', en: 'Accident and Emergency Department', zh: '急症室', phase: 2 },
];

export const WARD_CODES: readonly string[] = WARD_LIST.map((w) => w.code);

/** 今個階段開得嘅病房（開局選單用） */
export const OPEN_WARDS: readonly WardDef[] = WARD_LIST.filter((w) => w.phase === 1);

export const DEFAULT_WARD_CODE = 'MED';

export function wardDef(code: string): WardDef | undefined {
  return WARD_LIST.find((w) => w.code === code);
}

/** 例如「內科病房 General Medicine Ward」 */
export function wardLabel(code: string): string {
  const def = wardDef(code);
  return def ? `${def.zh} ${def.en}` : code;
}
