/**
 * 氧氣治療彈窗組句。括號說明只留在打開的清單；聊天與行動記錄用短標籤。
 * 數值超出範圍時不落單，也不改寫玩家輸入。
 */
import { oxygenDeviceById, oxygenOrderRejected, VENTURI_FIO2, type OxygenDeviceId } from '@/engine';
import { shortOptionLabel } from './drugOrder';
import type { PlacedOrderParams } from './types';

export const OXYGEN_DEVICE_OPTIONS = [
  { id: 'nc', phrase: 'Nasal cannula (NC)' },
  { id: 'simple', phrase: 'Simple face mask' },
  { id: 'venturi', phrase: 'Venturi mask' },
  { id: 'nrbm', phrase: 'Non-rebreather mask (NRBM)' },
  { id: 'hfnc', phrase: 'High-flow nasal cannula (HFNC)' },
  { id: 'niv', phrase: 'Non-invasive ventilation (CPAP / BiPAP)' },
  { id: 'bvm', phrase: 'Bag-valve-mask (BVM)' },
  { id: 'invasive', phrase: 'Invasive ventilation (endotracheal tube / tracheostomy)' },
] as const satisfies readonly { id: OxygenDeviceId; phrase: string }[];

export const OXYGEN_TARGETS = [
  { id: 'standard', phrase: '94–98% (Standard patient)' },
  { id: 'copd', phrase: '88–92% (COPD / Type II respiratory failure risk)' },
  { id: 'high', phrase: '>95% (Pregnancy / specific conditions)' },
  { id: 'full', phrase: '100% (Cardiac arrest / severe trauma / carbon monoxide)' },
] as const;

export const OXYGEN_HUMIDIFICATION = [
  { id: 'none', phrase: 'None' },
  { id: 'cold', phrase: 'Cold water bubble humidifier' },
  { id: 'heated', phrase: 'Heated humidification (HFNC / mechanical ventilation)' },
] as const;

export const OXYGEN_CHECKS = ['titrate', 'wean', 'meals', 'abg', 'oximetry'] as const;
export type OxygenCheckId = (typeof OXYGEN_CHECKS)[number];

export const VENTURI_OPTIONS = [
  { fio2: 24, phrase: '24% (Blue, 2 L/min)' },
  { fio2: 28, phrase: '28% (White, 4 L/min)' },
  { fio2: 31, phrase: '31% (Orange, 6 L/min)' },
  { fio2: 35, phrase: '35% (Yellow, 8 L/min)' },
  { fio2: 40, phrase: '40% (Red, 10 L/min)' },
  { fio2: 60, phrase: '60% (Green, 15 L/min)' },
] as const;

export interface OxygenDraft {
  targetPhrase: string;
  devicePhrase: string;
  flow: string;
  fio2: string;
  venturiPhrase: string;
  peep: string;
  humidificationPhrase: string;
  checks: readonly { id: OxygenCheckId; label: string; checked: boolean }[];
}

export interface OxygenFieldError {
  field: 'flow' | 'fio2' | 'peep';
  min: number;
  max: number;
  unit: string;
}

export type OxygenBuild =
  | { ok: true; catalogId: string; text: string; params: PlacedOrderParams }
  | { ok: false; error: OxygenFieldError | 'incomplete' };

function deviceId(phrase: string): OxygenDeviceId | null {
  return OXYGEN_DEVICE_OPTIONS.find((item) => item.phrase === phrase)?.id ?? null;
}

export function oxygenDeviceByPhrase(phrase: string) {
  const id = deviceId(phrase);
  return id ? oxygenDeviceById(id) : undefined;
}

/** 氧氣流量只接受整數 L/min。 */
export function parseInteger(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** 只接受普通十進數字。科學記號與空白尾碼都不當成數值。 */
export function parsePlainNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function rangeError(
  text: string,
  field: OxygenFieldError['field'],
  min: number,
  max: number,
  unit: string,
): OxygenFieldError | 'empty' | null {
  if (text.trim().length === 0) return 'empty';
  const value = field === 'flow' ? parseInteger(text) : parsePlainNumber(text);
  if (value === null || value < min || value > max) return { field, min, max, unit };
  return null;
}

export function oxygenFieldError(draft: OxygenDraft): OxygenFieldError | null {
  const id = deviceId(draft.devicePhrase);
  const device = id ? oxygenDeviceById(id) : undefined;
  if (!device) return null;
  if (device.kind === 'flow') {
    const error = rangeError(draft.flow, 'flow', device.flowMin, device.flowMax, 'L/min');
    return error === 'empty' || error === null ? null : error;
  }
  if (device.kind === 'hfnc') {
    const flow = rangeError(draft.flow, 'flow', 10, 60, 'L/min');
    if (flow && flow !== 'empty') return flow;
    const fio2 = rangeError(draft.fio2, 'fio2', 21, 100, '%');
    return fio2 && fio2 !== 'empty' ? fio2 : null;
  }
  if (device.kind === 'peep') {
    const fio2 = rangeError(draft.fio2, 'fio2', 21, 100, '%');
    if (fio2 && fio2 !== 'empty') return fio2;
    const peep = rangeError(draft.peep, 'peep', 5, 20, 'cmH2O');
    return peep && peep !== 'empty' ? peep : null;
  }
  return null;
}

export function buildOxygenOrder(draft: OxygenDraft): OxygenBuild {
  const id = deviceId(draft.devicePhrase);
  const device = id ? oxygenDeviceById(id) : undefined;
  const target = OXYGEN_TARGETS.find((item) => item.phrase === draft.targetPhrase);
  const humid = OXYGEN_HUMIDIFICATION.find((item) => item.phrase === draft.humidificationPhrase);
  if (!device || !target || !humid) return { ok: false, error: 'incomplete' };
  const fieldError = oxygenFieldError(draft);
  if (fieldError) return { ok: false, error: fieldError };

  const parts = ['Oxygen therapy', device.shortLabel];
  let dose: PlacedOrderParams['dose'] = null;
  let rate: PlacedOrderParams['rate'];

  if (device.kind === 'flow') {
    const flow = parseInteger(draft.flow);
    if (flow === null) return { ok: false, error: 'incomplete' };
    dose = { value: flow, unit: 'L/min' };
    parts.push(`${draft.flow.trim()} L/min`);
  } else if (device.kind === 'venturi') {
    const chosen = VENTURI_OPTIONS.find((item) => item.phrase === draft.venturiPhrase);
    if (!chosen || !VENTURI_FIO2.some((value) => value === chosen.fio2)) {
      return { ok: false, error: 'incomplete' };
    }
    dose = { value: chosen.fio2, unit: '%' };
    parts.push(shortOptionLabel(chosen.phrase));
  } else if (device.kind === 'hfnc') {
    const flow = parseInteger(draft.flow);
    const fio2 = parsePlainNumber(draft.fio2);
    if (flow === null || fio2 === null) return { ok: false, error: 'incomplete' };
    dose = { value: flow, unit: 'L/min' };
    rate = { value: fio2, unit: '%' };
    parts.push(`${draft.fio2.trim()}%`, `${draft.flow.trim()} L/min`);
  } else {
    const fio2 = parsePlainNumber(draft.fio2);
    const peep = parsePlainNumber(draft.peep);
    if (fio2 === null || peep === null) return { ok: false, error: 'incomplete' };
    dose = { value: fio2, unit: '%' };
    rate = { value: peep, unit: 'cmH2O' };
    parts.push(`${draft.fio2.trim()}%`, `${draft.peep.trim()} cmH2O`);
  }

  parts.push(shortOptionLabel(target.phrase));
  if (humid.id !== 'none') parts.push(shortOptionLabel(humid.phrase));
  const checks = draft.checks.filter((item) => item.checked).map((item) => item.label);
  const summary = checks.length > 0 ? `${parts.join(' ')} | ${checks.join(', ')}` : parts.join(' ');
  if (oxygenOrderRejected(device.catalogId, dose, rate)) return { ok: false, error: 'incomplete' };
  return {
    ok: true,
    catalogId: device.catalogId,
    text: summary,
    params: {
      drugFormularyId: null,
      dose,
      route: null,
      ...(rate ? { rate } : {}),
      summary,
    },
  };
}
