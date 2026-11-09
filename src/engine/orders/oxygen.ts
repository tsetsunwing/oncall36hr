/**
 * 氧氣治療的裝置與數值範圍。
 * 鼻導管與非再呼吸面罩沿用現有 order-effects。其餘裝置不新增生命表徵曲線，只記下醫囑並標 PENDING_CLINICAL_REVIEW。
 * 超出範圍時拒絕落單，不把數字收進界限。
 */
export const OXYGEN_DEVICES = [
  {
    id: 'nc',
    catalogId: 'oxygen.nasal',
    shortLabel: 'Nasal cannula',
    kind: 'flow',
    flowMin: 1,
    flowMax: 6,
    engineEffect: true,
  },
  {
    id: 'simple',
    catalogId: 'oxygen.simple',
    shortLabel: 'Simple face mask',
    kind: 'flow',
    flowMin: 5,
    flowMax: 10,
    engineEffect: false,
  },
  {
    id: 'venturi',
    catalogId: 'oxygen.venturi',
    shortLabel: 'Venturi mask',
    kind: 'venturi',
    engineEffect: false,
  },
  {
    id: 'nrbm',
    catalogId: 'oxygen.nrb',
    shortLabel: 'Non-rebreather mask',
    kind: 'flow',
    flowMin: 10,
    flowMax: 15,
    engineEffect: true,
  },
  {
    id: 'hfnc',
    catalogId: 'oxygen.hfnc',
    shortLabel: 'High-flow nasal cannula',
    kind: 'hfnc',
    engineEffect: false,
  },
  {
    id: 'niv',
    catalogId: 'oxygen.niv',
    shortLabel: 'Non-invasive ventilation',
    kind: 'peep',
    engineEffect: false,
  },
  {
    id: 'bvm',
    catalogId: 'oxygen.bvm',
    shortLabel: 'Bag-valve-mask',
    kind: 'flow',
    flowMin: 10,
    flowMax: 15,
    engineEffect: false,
  },
  {
    id: 'invasive',
    catalogId: 'oxygen.invasive',
    shortLabel: 'Invasive ventilation',
    kind: 'peep',
    engineEffect: false,
  },
] as const;

export type OxygenDevice = (typeof OXYGEN_DEVICES)[number];
export type OxygenDeviceId = OxygenDevice['id'];

export const VENTURI_FIO2 = [24, 28, 31, 35, 40, 60] as const;

const HFNC_FLOW = { min: 10, max: 60 };
const FIO2 = { min: 21, max: 100 };
const PEEP = { min: 5, max: 20 };

export function oxygenDeviceById(id: string): OxygenDevice | undefined {
  return OXYGEN_DEVICES.find((device) => device.id === id);
}

export function oxygenDeviceByCatalog(catalogId: string): OxygenDevice | undefined {
  return OXYGEN_DEVICES.find((device) => device.catalogId === catalogId);
}

function within(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function flowDose(dose: { value: number; unit: string } | null, min: number, max: number): boolean {
  return dose !== null && dose.unit === 'L/min' && within(dose.value, min, max);
}

function percentOk(
  dose: { value: number; unit: string } | null,
  ok: (value: number) => boolean,
): boolean {
  return dose !== null && dose.unit === '%' && ok(dose.value);
}

function rateOk(
  rate: { value: number; unit: string } | undefined,
  unit: string,
  min: number,
  max: number,
): boolean {
  if (rate === undefined) return false;
  if (rate.unit !== unit) return false;
  return within(rate.value, min, max);
}

/**
 * 這個 catalog 是氧氣治療，而且流量、FiO2 或 PEEP 不在範圍內時返回 true。
 * 不是氧氣治療的醫囑返回 false。
 */
export function oxygenOrderRejected(
  catalogId: string,
  dose: { value: number; unit: string } | null,
  rate: { value: number; unit: string } | undefined,
): boolean {
  const device = oxygenDeviceByCatalog(catalogId);
  if (!device) return false;
  if (device.kind === 'flow') {
    if (rate) return true;
    return !flowDose(dose, device.flowMin, device.flowMax);
  }
  if (device.kind === 'venturi') {
    if (rate) return true;
    return !percentOk(dose, (value) => VENTURI_FIO2.some((item) => item === value));
  }
  if (device.kind === 'hfnc') {
    return !flowDose(dose, HFNC_FLOW.min, HFNC_FLOW.max) || !rateOk(rate, '%', FIO2.min, FIO2.max);
  }
  return (
    !percentOk(dose, (value) => within(value, FIO2.min, FIO2.max)) ||
    !rateOk(rate, 'cmH2O', PEEP.min, PEEP.max)
  );
}
