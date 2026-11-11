import { UNLISTED_DRUG_CATALOG_ID } from '@/content/drugEffects';
import type { MedicationOption, PlacedOrderParams } from './types';

export { UNLISTED_DRUG_CATALOG_ID };

/** 藥物醫囑表組句。只拼玩家揀嘅字，唔查劑量表。 */
export const DRUG_ROUTES = [
  { id: 'po', phrase: 'PO (Oral)' },
  { id: 'iv', phrase: 'IV (Intravenous bolus/push)' },
  { id: 'iv-infusion', phrase: 'IV Infusion (Continuous drip / syringe pump)' },
  { id: 'im', phrase: 'IM (Intramuscular)' },
  { id: 'sc', phrase: 'SC (Subcutaneous)' },
  { id: 'sl', phrase: 'SL (Sublingual)' },
  { id: 'neb', phrase: 'NEB (Nebulizer)' },
] as const;

export const DOSE_UNITS = ['mg', 'g', 'microgram', 'mL', 'mmol', 'unit'] as const;

export const FREQUENCIES = [
  'STAT',
  'Daily',
  'BD (twice)',
  'TDS (thrice)',
  'QID (four times)',
  'Q1H',
  'Q2H',
  'Q4H',
  'Q6H',
  'Q8H',
  'Q12H',
  'Q24H',
] as const;

export const DILUENTS = ['0.9% NaCl', '5% Dextrose', "Hartmann's", 'Neat (No diluent)'] as const;

export const INFUSION_VOLUMES = ['10 mL', '50 mL', '100 mL', '250 mL', '500 mL'] as const;

export const RATE_UNITS = ['mL/hr', 'unit/hr'] as const;

export const PRN_REASONS = ['Fever'] as const;

export const TITRATION_TARGETS = ['MAP > 65 mmHg', 'HR 60-100 bpm', 'BP < 140 mmHg'] as const;

/** 括號只出現喺打開嘅選項清單。其餘地方用括號前嘅字。 */
export function shortOptionLabel(text: string): string {
  const cut = text.indexOf('(');
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

export interface DrugOrderDraft {
  stem: string;
  route: string | null;
  doseValue: string;
  doseUnit: string | null;
  frequency: string | null;
  diluent: string | null;
  volume: string | null;
  rateValue: string;
  rateUnit: string | null;
  concentration: string;
  prn: string | null;
  prnComparison?: '＞' | '≥' | '＜' | '≤' | '=' | null;
  prnThreshold?: string;
  titration: string | null;
  infuseOverMins: string;
  afterFood: boolean;
  rapidFlush: boolean;
}

export function isInfusionRoute(route: string | null): boolean {
  return route?.startsWith('IV Infusion') ?? false;
}

/** 未滿三個英文字母不顯示建議。只搜尋呼叫者傳入的治療藥表，再按所選類別收窄。 */
export function suggestTreatmentDrugs(
  query: string,
  medications: readonly MedicationOption[],
  drugClass: string | null = null,
): MedicationOption[] {
  const normalized = query.normalize('NFKC');
  const letters = normalized.match(/[A-Za-z]/g);
  if (!letters || letters.length < 3) return [];
  const needle = normalized.trim().toLowerCase();
  if (needle.length === 0) return [];
  return medications.filter((item) => {
    const named =
      item.label.toLowerCase().includes(needle) ||
      (item.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
    if (!named) return false;
    if (!drugClass) return true;
    return (item.classes ?? []).includes(drugClass);
  });
}

function positiveNumber(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/.test(trimmed) && Number(trimmed) > 0;
}

/** 藥物、途徑、劑量、單位，再加頻次或者完整輸注設定。其餘可留空。 */
export function drugOrderReady(draft: DrugOrderDraft): boolean {
  if (draft.stem.trim().length === 0 || !draft.route || !draft.doseUnit) return false;
  if (!positiveNumber(draft.doseValue)) return false;
  if (isInfusionRoute(draft.route)) {
    return (
      draft.diluent !== null &&
      draft.volume !== null &&
      draft.rateUnit !== null &&
      positiveNumber(draft.rateValue)
    );
  }
  if (draft.prn) {
    const value = draft.prnThreshold?.trim() ?? '';
    if (
      !draft.frequency ||
      !/^Q(1|2|4|6|8|12|24)H$/.test(draft.frequency) ||
      !draft.prnComparison ||
      !/^-?\d+(?:\.\d+)?$/.test(value)
    )
      return false;
    if (draft.prn !== 'Fever') return false;
  }
  return draft.frequency !== null;
}

export const EMPTY_PLACED_PARAMS: PlacedOrderParams = {
  drugFormularyId: null,
  dose: null,
  route: null,
};

/** 藥物表確認後嘅結構化欄位。聊天句子只係顯示，唔再拿去解析。 */
export function placedDrugParams(
  formularyId: string,
  draft: DrugOrderDraft,
): PlacedOrderParams | null {
  if (!drugOrderReady(draft) || !draft.route || !draft.doseUnit) return null;
  const params: PlacedOrderParams = {
    drugFormularyId: formularyId,
    dose: { value: Number(draft.doseValue), unit: shortOptionLabel(draft.doseUnit) },
    route: shortOptionLabel(draft.route),
  };
  if (isInfusionRoute(draft.route) && draft.rateUnit) {
    params.rate = { value: Number(draft.rateValue), unit: shortOptionLabel(draft.rateUnit) };
    if (draft.concentration.trim()) params.concentration = draft.concentration.trim();
    if (draft.diluent) params.diluent = shortOptionLabel(draft.diluent);
    const volume = draft.volume?.match(/^(\d+(?:\.\d+)?) mL$/);
    if (volume?.[1] && Number(volume[1]) > 0) params.volumeMl = Number(volume[1]);
  } else if (draft.frequency) {
    params.frequency = shortOptionLabel(draft.frequency);
    if (draft.prn && draft.prnComparison && draft.prnThreshold !== undefined) {
      const comparison = { '＞': '>', '≥': '>=', '＜': '<', '≤': '<=', '=': '=' } as const;
      params.prnReason = shortOptionLabel(draft.prn);
      params.prnCondition = {
        metric: 'TEMPERATURE',
        comparison: comparison[draft.prnComparison],
        threshold: Number(draft.prnThreshold),
      };
    }
  }
  if (positiveNumber(draft.infuseOverMins)) {
    params.infuseOverMinutes = Number(draft.infuseOverMins.trim());
  }
  return params;
}

/** 組一句交回聊天顯示。可選項目放喺 ` | ` 後面。落單唔再解析呢句。 */
export function composeDrugOrderPhrase(draft: DrugOrderDraft): string | null {
  if (!drugOrderReady(draft) || !draft.route || !draft.doseUnit) return null;
  const infusion = isInfusionRoute(draft.route);
  const head = [
    draft.stem.trim(),
    `${draft.doseValue.trim()} ${shortOptionLabel(draft.doseUnit)}`,
    shortOptionLabel(draft.route),
  ];
  if (infusion && draft.rateUnit) {
    head.push(`${draft.rateValue.trim()} ${shortOptionLabel(draft.rateUnit)}`);
  } else if (draft.frequency) head.push(shortOptionLabel(draft.frequency));
  const extras: string[] = [];
  if (infusion) {
    if (draft.concentration.trim()) extras.push(draft.concentration.trim());
    if (draft.diluent) extras.push(shortOptionLabel(draft.diluent));
    if (draft.volume) extras.push(shortOptionLabel(draft.volume));
    if (draft.titration) extras.push(shortOptionLabel(draft.titration));
  } else if (draft.prn)
    extras.push(
      `PRN ${shortOptionLabel(draft.prn)} ${draft.prnComparison ?? ''} ${draft.prnThreshold ?? ''}`.trim(),
    );
  if (positiveNumber(draft.infuseOverMins)) {
    extras.push(`Infuse over ${draft.infuseOverMins.trim()} mins`);
  }
  if (draft.afterFood) extras.push('Take after food');
  if (draft.rapidFlush) extras.push('Rapid IV push + 20 mL flush');
  const base = head.join(' ');
  return extras.length > 0 ? `${base} | ${extras.join(', ')}` : base;
}
