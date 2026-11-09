/**
 * 觀察面板：揀一個項目，檢查一次，或按引擎已有的監察間距設定。
 * 引擎沒有該間距時，本地記下醫囑，標籤寫上間距，不產生結果數字。
 */
import type { PlacedOrderParams } from './types';

export const OBSERVE_PARAMETERS = [
  { id: 'vitals', label: '全套生命表徵' },
  { id: 'bp', label: '血壓' },
  { id: 'pulse', label: '脈搏' },
  { id: 'rr', label: '呼吸頻率' },
  { id: 'temp', label: '體溫' },
  { id: 'spo2', label: 'SpO2' },
  { id: 'io', label: '出入量' },
  { id: 'gcs', label: 'GCS' },
  { id: 'pupils', label: '瞳孔' },
  { id: 'pain', label: '疼痛分數' },
] as const;

export type ObserveParameterId = (typeof OBSERVE_PARAMETERS)[number]['id'];

/** 引擎已有的監察間距。括號內的代碼只在打開的清單顯示。 */
export const OBSERVE_INTERVALS = [
  { id: 'q15min', phrase: '每 15 分鐘 (q15min)' },
  { id: 'continuous', phrase: '持續 (continuous)' },
] as const;

export type ObserveIntervalId = (typeof OBSERVE_INTERVALS)[number]['id'];
export type ObserveMode = 'once' | 'monitor';

export const LOCAL_OBSERVATION_CATALOG_ID = 'obs.record';

export interface ObserveOrder {
  catalogId: string;
  text: string;
  params: PlacedOrderParams;
  /** 引擎沒有對應間距，只本地記錄。 */
  local: boolean;
}

function parameterLabel(id: ObserveParameterId): string {
  return OBSERVE_PARAMETERS.find((item) => item.id === id)?.label ?? id;
}

function intervalLabel(id: ObserveIntervalId): string {
  const phrase = OBSERVE_INTERVALS.find((item) => item.id === id)?.phrase ?? id;
  const cut = phrase.indexOf('(');
  return (cut === -1 ? phrase : phrase.slice(0, cut)).trim();
}

/** 全套生命表徵預設每 15 分鐘；SpO2 與出入量預設持續，對上現有醫囑。 */
export function defaultObserveInterval(parameter: ObserveParameterId): ObserveIntervalId {
  if (parameter === 'spo2' || parameter === 'io') return 'continuous';
  return 'q15min';
}

function engineCatalog(
  parameter: ObserveParameterId,
  mode: ObserveMode,
  interval: ObserveIntervalId,
): string | null {
  if (mode === 'once' && parameter === 'vitals') return 'obs.vitals';
  if (mode === 'once' && parameter === 'pulse') return 'obs.pulse';
  if (mode === 'monitor' && parameter === 'vitals' && interval === 'q15min') {
    return 'monitor.vitals.q15';
  }
  if (mode === 'monitor' && parameter === 'spo2' && interval === 'continuous')
    return 'monitor.spo2';
  if (mode === 'monitor' && parameter === 'io' && interval === 'continuous') return 'monitor.io';
  return null;
}

export function buildObserveOrder(
  parameter: ObserveParameterId,
  mode: ObserveMode,
  interval: ObserveIntervalId,
): ObserveOrder {
  const name = parameterLabel(parameter);
  const text = mode === 'once' ? `檢查${name}` : `${name} ${intervalLabel(interval)}`;
  const catalogId = engineCatalog(parameter, mode, interval);
  return {
    catalogId: catalogId ?? LOCAL_OBSERVATION_CATALOG_ID,
    text,
    params: { drugFormularyId: null, dose: null, route: null, summary: text },
    local: catalogId === null,
  };
}
