/** 報告面板嘅分類。result id → 化驗／影像／即場，同埋下一層部門。 */
export type ReportBucket = 'laboratory' | 'radiology' | 'poct';

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

export const RAD_SECTIONS = ['xr', 'ct', 'mri', 'us'] as const;

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

export function sectionsFor(bucket: ReportBucket): readonly string[] {
  if (bucket === 'laboratory') return LAB_SECTIONS;
  if (bucket === 'radiology') return RAD_SECTIONS;
  return POCT_SECTIONS;
}
