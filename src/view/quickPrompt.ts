import type { QuickWordRow } from '@/engine';
import type {
  PlacedOrderParams,
  QuickChipFrequencyField,
  QuickChipPrompt,
  QuickChipPromptField,
  QuickPromptFieldId,
} from './types';

const FIELD_ORDER: readonly QuickPromptFieldId[] = [
  'dose',
  'route',
  'frequency',
  'times',
  'volume',
  'rate',
  'energy',
  'flow',
  'transfusion',
];

const ROUTES = ['IV', 'PO', 'IM', 'SC', 'IO'] as const;
const REQUIRED = new Set<QuickPromptFieldId>([
  'dose',
  'route',
  'volume',
  'energy',
  'flow',
  'transfusion',
]);

export interface PromptPhraseValues {
  dose?: { value: number; unit: string } | null;
  route?: string | null;
  frequency?: string | null;
  times?: number | null;
  volume?: number | null;
  rate?: number | null;
  energy?: number | null;
  flow?: number | null;
  transfusion?: number | null;
}

/** 彈窗確認後組出嘅句子。engine 嘅 matchPromptPhrase 食同一款格式。 */
export function composePromptPhrase(stem: string, values: PromptPhraseValues): string {
  const bits = [stem.trim()];
  if (values.dose) bits.push(`${String(values.dose.value)} ${values.dose.unit}`);
  if (values.route) bits.push(values.route);
  if (values.frequency) bits.push(values.frequency);
  if (values.times) bits.push(`x${String(values.times)}`);
  if (values.volume != null) bits.push(`${String(values.volume)} ml`);
  if (values.rate != null) bits.push(`${String(values.rate)} ml/hr`);
  if (values.energy != null) bits.push(`${String(values.energy)} J`);
  if (values.flow != null) bits.push(`${String(values.flow)} L/min`);
  if (values.transfusion != null) bits.push(`${String(values.transfusion)} unit`);
  return bits.join(' ');
}

export function chipPrompt(
  word: QuickWordRow,
  formulary: { units: readonly string[]; routes: readonly string[] } | null,
): QuickChipPrompt | null {
  if (!word.prompt?.length || !word.promptStem) return null;
  const asked = new Set(word.prompt);
  const defaults = word.promptDefaults;
  const fields: QuickChipPromptField[] = [];
  for (const id of FIELD_ORDER) {
    if (!asked.has(id)) continue;
    fields.push(fieldFor(id, word, formulary, defaults));
  }
  return { stem: word.promptStem, fields };
}

function fieldFor(
  id: QuickPromptFieldId,
  word: QuickWordRow,
  formulary: { units: readonly string[]; routes: readonly string[] } | null,
  defaults: QuickWordRow['promptDefaults'],
): QuickChipPromptField {
  const required = REQUIRED.has(id);
  if (id === 'dose') {
    const units = formulary?.units ?? ['mg', 'g'];
    const dose = word.params?.dose;
    const unit = dose && units.includes(dose.unit) ? dose.unit : (units[0] ?? 'mg');
    return { id, kind: 'amount', units, value: dose?.value ?? null, unit, required };
  }
  if (id === 'route') {
    const options = formulary?.routes ?? [...ROUTES];
    return {
      id,
      kind: 'select',
      options,
      value: word.params?.route ?? null,
      required,
    };
  }
  if (id === 'frequency') {
    const value = defaults?.frequency ?? null;
    return {
      id,
      kind: 'frequency',
      value,
      every: defaults?.every ?? null,
      required,
    } satisfies QuickChipFrequencyField;
  }
  if (id === 'times') {
    return {
      id,
      kind: 'select',
      options: ['x1', 'x2', 'x3'],
      value: defaults?.times ? `x${String(defaults.times)}` : null,
      required,
    };
  }
  if (id === 'volume') return amount(id, ['ml'], defaults?.volume ?? null, required);
  if (id === 'rate') return amount(id, ['ml/hr'], defaults?.rate ?? null, required);
  if (id === 'energy') {
    return amount(
      id,
      ['J'],
      word.params?.dose?.unit === 'J' ? word.params.dose.value : (defaults?.energy ?? null),
      required,
    );
  }
  if (id === 'flow') {
    const bounds = flowBounds(word.catalogId);
    return amount(id, ['L/min'], defaults?.flow ?? null, required, bounds);
  }
  return amount('transfusion', ['unit'], defaults?.transfusion ?? null, required);
}

/** 氧氣、點滴、能量彈窗確認後嘅欄位。句子只係顯示，唔再拿去解析。 */
export function placedPromptParams(
  values: PromptPhraseValues,
  formularyId: string | null,
): PlacedOrderParams {
  let dose = values.dose ?? null;
  if (!dose && values.flow != null) dose = { value: values.flow, unit: 'L/min' };
  else if (!dose && values.energy != null) dose = { value: values.energy, unit: 'J' };
  else if (!dose && values.volume != null) dose = { value: values.volume, unit: 'ml' };
  else if (!dose && values.transfusion != null) dose = { value: values.transfusion, unit: 'unit' };
  const params: PlacedOrderParams = {
    drugFormularyId: formularyId,
    dose,
    route: values.route ?? null,
  };
  if (values.frequency) params.frequency = values.frequency;
  if (values.times) params.times = values.times;
  if (values.rate != null) params.rate = { value: values.rate, unit: 'ml/hr' };
  return params;
}

function flowBounds(catalogId: string): { min: number; max: number } | undefined {
  if (catalogId === 'oxygen.nasal') return { min: 1, max: 6 };
  if (catalogId === 'oxygen.nrb') return { min: 10, max: 15 };
  return undefined;
}

function amount(
  id: 'volume' | 'rate' | 'energy' | 'flow' | 'transfusion',
  units: readonly string[],
  value: number | null,
  required: boolean,
  bounds?: { min: number; max: number },
): QuickChipPromptField {
  return {
    id,
    kind: 'amount',
    units,
    value,
    unit: units[0] ?? '',
    required,
    ...(bounds ?? {}),
  };
}
