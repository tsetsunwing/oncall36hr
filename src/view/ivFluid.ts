/**
 * 治療 Drugs 彈窗的 IVF 處方。輸液名稱、途徑、容量／速率與濃度欄位，
 * 不用 µg/kg/min。引擎仍收 fluid.maintenance 的 bag 循環或 NS bolus。
 */
import { isInfusionRoute, shortOptionLabel } from './drugOrder';
import type { PlacedOrderParams } from './types';

export const IV_FLUID_OPTIONS = [
  {
    id: 'ns',
    label: '0.9% Sodium Chloride (Normal saline)',
    solutions: ['0.9% Sodium Chloride'],
  },
  { id: 'd5', label: '5% Dextrose (D5)', solutions: ['D5'] },
  { id: 'hartmanns', label: "Hartmann's", solutions: ["Hartmann's"] },
  {
    id: 'half',
    label: '1/2:1/2 (0.45% Sodium Chloride + 2.5% Dextrose)',
    solutions: ['0.45% Sodium Chloride + 2.5% Dextrose'],
  },
  { id: '2d1s', label: '2D1S (D5 → D5 → NS)', solutions: ['D5', 'D5', 'NS'] },
  { id: 'custom', label: 'Other (comma-separated cycle)', solutions: [] },
] as const;

export const IVF_ROUTES = [
  'IV (Intravenous bolus/push)',
  'IV Infusion (Continuous drip / syringe pump)',
] as const;

export const IVF_VOLUMES = ['250 mL', '500 mL', '1000 mL'] as const;

/** IVF 只用泵可設定的容量速率，不含 kg／min。 */
export const IVF_RATE_UNITS = ['mL/hr'] as const;

export const NS500_CATALOG_ID = 'fluid.ns500';
export const MAINTENANCE_FLUID_CATALOG_ID = 'fluid.maintenance';

export interface IvFluidDraft {
  fluidLabel: string;
  custom: string;
  route: string | null;
  volume: string | null;
  rateValue: string;
  rateUnit: string | null;
  concentration: string;
  maxBags: string;
}

export interface IvFluidBuild {
  catalogId: string;
  text: string;
  params: PlacedOrderParams;
}

function positiveNumber(value: string): boolean {
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/.test(trimmed) && Number(trimmed) > 0;
}

function parseVolumeMl(volume: string | null): number | null {
  const match = volume?.match(/^(\d+(?:\.\d+)?) mL$/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function solutionsFor(fluidLabel: string, custom: string): string[] {
  const option = IV_FLUID_OPTIONS.find((item) => item.label === fluidLabel);
  if (!option || option.id === 'custom') {
    return custom
      .split(/[,→]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [...option.solutions];
}

function isNormalSaline(solutions: readonly string[]): boolean {
  if (solutions.length !== 1) return false;
  const name = solutions[0]?.toLowerCase() ?? '';
  return (
    name === 'ns' ||
    name.includes('normal saline') ||
    name.includes('0.9% sodium chloride') ||
    name === '0.9% nacl'
  );
}

export function durationSecondsFromRate(volumeMl: number, rateMlPerHour: number): number | null {
  if (!(volumeMl > 0) || !(rateMlPerHour > 0)) return null;
  const secs = Math.round((volumeMl / rateMlPerHour) * 3600);
  return Number.isSafeInteger(secs) && secs > 0 ? secs : null;
}

export function ivFluidReady(draft: IvFluidDraft): boolean {
  return buildIvFluidOrder(draft) !== null;
}

/** 組 IVF 醫囑。濃度可留空；瓶數可留空（持續換瓶）。 */
export function buildIvFluidOrder(draft: IvFluidDraft): IvFluidBuild | null {
  if (!draft.route || !draft.volume || !draft.rateUnit) return null;
  if (!IVF_RATE_UNITS.some((unit) => unit === draft.rateUnit)) return null;
  if (!positiveNumber(draft.rateValue)) return null;
  const solutions = solutionsFor(draft.fluidLabel, draft.custom);
  if (
    solutions.length === 0 ||
    solutions.length > 20 ||
    solutions.some((item) => item.length > 120)
  ) {
    return null;
  }
  const volumeMl = parseVolumeMl(draft.volume);
  const rateMlPerHour = Number(draft.rateValue.trim());
  const durationSeconds = durationSecondsFromRate(volumeMl ?? 0, rateMlPerHour);
  if (volumeMl === null || durationSeconds === null) return null;
  if (draft.concentration.trim().length > 120) return null;
  const maxBags = draft.maxBags.trim();
  if (
    maxBags.length > 0 &&
    (!/^\d+$/.test(maxBags) || !Number.isSafeInteger(Number(maxBags)) || Number(maxBags) <= 0)
  ) {
    return null;
  }
  const additive = draft.concentration.trim();
  const infusion = isInfusionRoute(draft.route);
  const route = shortOptionLabel(draft.route);
  const bags = maxBags.length > 0 ? ` for ${maxBags} bags` : '';
  const extra = additive.length > 0 ? ` + ${additive}` : '';
  const text = `${solutions.join(' → ')}${extra} ${String(volumeMl)} mL ${route} ${draft.rateValue.trim()} ${shortOptionLabel(draft.rateUnit)}${bags}`;
  const bolusNs = !infusion && isNormalSaline(solutions);
  if (bolusNs) {
    return {
      catalogId: NS500_CATALOG_ID,
      text,
      params: {
        drugFormularyId: null,
        dose: { value: volumeMl, unit: 'mL' },
        route,
        volumeMl,
        rate: { value: rateMlPerHour, unit: shortOptionLabel(draft.rateUnit) },
        ...(additive ? { concentration: additive } : {}),
      },
    };
  }
  return {
    catalogId: MAINTENANCE_FLUID_CATALOG_ID,
    text,
    params: {
      drugFormularyId: null,
      dose: null,
      route,
      volumeMl,
      rate: { value: rateMlPerHour, unit: shortOptionLabel(draft.rateUnit) },
      ...(additive ? { concentration: additive } : {}),
      fluidRegimen: {
        solutions,
        volumeMl,
        durationSeconds,
        ...(maxBags ? { maxBags: Number(maxBags) } : {}),
        ...(additive ? { additive } : {}),
      },
    },
  };
}
