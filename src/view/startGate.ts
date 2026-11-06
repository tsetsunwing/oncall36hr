import { isSettingsComplete, validateSettings, type Settings, type SettingsField } from '@/storage';

export type StartGate = { canStart: true } | { canStart: false; missing: SettingsField[] };

/** 沒有可用嘅 AI 設定就唔可以開局（spec §21：沒有示範模式）。 */
export function selectStartGate(settings: Settings): StartGate {
  if (isSettingsComplete(settings)) return { canStart: true };
  return { canStart: false, missing: validateSettings(settings) };
}
