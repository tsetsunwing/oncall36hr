/** 報告面板嘅分類。result id → 化驗／影像／即場／核子醫學，同埋下一層部門。 */
export type ReportBucket = 'laboratory' | 'radiology' | 'poct' | 'nm';

export interface ReportCategory {
  bucket: ReportBucket;
  section: string;
}

export const LAB_SECTIONS = [
  'biochem',
  'haem',
  'micro',
  'cytology',
  'histo',
  'immuno',
  'genetics',
  'tox',
] as const;

export const RAD_SECTIONS = ['xr', 'fl', 'ct', 'mri', 'us'] as const;

export const NM_SECTIONS = ['nm'] as const;

export const POCT_SECTIONS = [
  'glucose',
  'istat',
  'rat',
  'inr',
  'tropT',
  'urine',
  'hb',
  'hba1c',
  'ecg',
] as const;

const BY_RESULT: Record<string, ReportCategory> = {
  'res.rft': { bucket: 'laboratory', section: 'biochem' },
  'res.troponin': { bucket: 'laboratory', section: 'biochem' },
  'res.cbc': { bucket: 'laboratory', section: 'haem' },
  'res.crossmatch': { bucket: 'laboratory', section: 'haem' },
  'res.bloodculture': { bucket: 'laboratory', section: 'micro' },
  'res.cytology': { bucket: 'laboratory', section: 'cytology' },
  'res.histology': { bucket: 'laboratory', section: 'histo' },
  'res.serology': { bucket: 'laboratory', section: 'immuno' },
  'res.genetics': { bucket: 'laboratory', section: 'genetics' },
  'res.toxicology': { bucket: 'laboratory', section: 'tox' },
  'res.cxr': { bucket: 'radiology', section: 'xr' },
  'res.ct.thorax': { bucket: 'radiology', section: 'ct' },
  'res.mri': { bucket: 'radiology', section: 'mri' },
  'res.us.abdomen': { bucket: 'radiology', section: 'us' },
  'res.pocus': { bucket: 'radiology', section: 'us' },
  'res.barium.swallow': { bucket: 'radiology', section: 'fl' },
  'res.barium.meal': { bucket: 'radiology', section: 'fl' },
  'res.barium.enema': { bucket: 'radiology', section: 'fl' },
  'res.vq': { bucket: 'nm', section: 'nm' },
  'res.bone.scan': { bucket: 'nm', section: 'nm' },
  'res.dmsa': { bucket: 'nm', section: 'nm' },
  'res.muga': { bucket: 'nm', section: 'nm' },
  'res.pet': { bucket: 'nm', section: 'nm' },
  'res.glucose': { bucket: 'poct', section: 'glucose' },
  'res.abg': { bucket: 'poct', section: 'istat' },
  'res.rat': { bucket: 'poct', section: 'rat' },
  'res.inr': { bucket: 'poct', section: 'inr' },
  'res.troponinT': { bucket: 'poct', section: 'tropT' },
  'res.urine': { bucket: 'poct', section: 'urine' },
  'res.hb': { bucket: 'poct', section: 'hb' },
  'res.hba1c': { bucket: 'poct', section: 'hba1c' },
  'res.ecg': { bucket: 'poct', section: 'ecg' },
};

export function reportCategory(resultId: string): ReportCategory {
  return BY_RESULT[resultId] ?? { bucket: 'laboratory', section: 'biochem' };
}

export function knownReportCategory(resultId: string): ReportCategory | null {
  return BY_RESULT[resultId] ?? null;
}

/** 檢查選單由左至右：組別，然後報告面板的部門。空部門仍然列出。 */
export const TEST_MENU_BUCKETS: readonly ReportBucket[] = ['laboratory', 'radiology', 'poct', 'nm'];

export const TEST_MENU_SECTIONS: Record<ReportBucket, readonly string[]> = {
  laboratory: ['haem', 'biochem', 'micro', 'cytology', 'histo', 'immuno', 'genetics', 'tox'],
  radiology: ['xr', 'fl', 'ct', 'mri', 'us'],
  poct: ['ecg', 'istat', 'glucose', 'rat', 'inr', 'tropT', 'urine', 'hb', 'hba1c'],
  nm: ['nm'],
};

/** 同一部門內，現有檢查的次序。唔喺表內的真檢查會排在後面。 */
export const TEST_ACTION_ORDER: Record<string, readonly string[]> = {
  haem: ['lab.cbc', 'lab.crossmatch'],
  biochem: ['lab.rft', 'lab.troponin'],
  micro: ['lab.bloodculture'],
  xr: ['img.cxr'],
  ct: ['img.ct.thorax'],
  mri: ['img.mri'],
  us: ['img.us.abdomen', 'img.pocus'],
  fl: ['img.barium.swallow', 'img.barium.meal', 'img.barium.enema'],
  nm: ['img.vq', 'img.bone.scan', 'img.dmsa', 'img.muga', 'img.pet'],
  ecg: ['ecg.12lead'],
  istat: ['lab.abg'],
  glucose: ['poct.glucose'],
  rat: ['poct.rat'],
  inr: ['poct.inr'],
  tropT: ['poct.troponinT'],
  urine: ['poct.urine'],
  hb: ['poct.hb'],
  hba1c: ['poct.hba1c'],
};

export function sectionsFor(bucket: ReportBucket): readonly string[] {
  if (bucket === 'laboratory') return LAB_SECTIONS;
  if (bucket === 'radiology') return RAD_SECTIONS;
  if (bucket === 'nm') return NM_SECTIONS;
  return POCT_SECTIONS;
}
