import type { PlacedOrderParams } from './types';

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

export const RATE_UNITS = ['mL/hr', 'microgram/kg/min', 'microgram/min', 'unit/hr'] as const;

export const PRN_REASONS = ['Fever', 'Pain', 'Agitation', 'Nausea'] as const;

export const TITRATION_TARGETS = ['MAP > 65 mmHg', 'HR 60-100 bpm', 'BP < 140 mmHg'] as const;

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
  prn: string | null;
  titration: string | null;
  infuseOverMins: string;
  afterFood: boolean;
  rapidFlush: boolean;
}

export function isInfusionRoute(route: string | null): boolean {
  return route?.startsWith('IV Infusion') ?? false;
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
    dose: { value: Number(draft.doseValue), unit: draft.doseUnit },
    route: draft.route,
  };
  if (isInfusionRoute(draft.route) && draft.rateUnit) {
    params.rate = { value: Number(draft.rateValue), unit: draft.rateUnit };
  } else if (draft.frequency) {
    params.frequency = draft.frequency;
  }
  return params;
}

/** 組一句交回聊天顯示。可選項目放喺 ` | ` 後面。落單唔再解析呢句。 */
export function composeDrugOrderPhrase(draft: DrugOrderDraft): string | null {
  if (!drugOrderReady(draft) || !draft.route || !draft.doseUnit) return null;
  const infusion = isInfusionRoute(draft.route);
  const head = [draft.stem.trim(), `${draft.doseValue.trim()} ${draft.doseUnit}`, draft.route];
  if (infusion && draft.rateUnit) head.push(`${draft.rateValue.trim()} ${draft.rateUnit}`);
  else if (draft.frequency) head.push(draft.frequency);
  const extras: string[] = [];
  if (infusion) {
    if (draft.diluent) extras.push(draft.diluent);
    if (draft.volume) extras.push(draft.volume);
    if (draft.titration) extras.push(draft.titration);
  } else if (draft.prn) extras.push(`PRN ${draft.prn}`);
  if (positiveNumber(draft.infuseOverMins)) {
    extras.push(`Infuse over ${draft.infuseOverMins.trim()} mins`);
  }
  if (draft.afterFood) extras.push('Take after food');
  if (draft.rapidFlush) extras.push('Rapid IV push + 20 mL flush');
  const base = head.join(' ');
  return extras.length > 0 ? `${base} | ${extras.join(', ')}` : base;
}
