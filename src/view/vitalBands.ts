/**
 * 監察儀顯示用嘅四級分段。只影響數值閃爍同驚嘆號，唔參與 MEWS 計分。
 * 端點包含在內。沒有列明嘅缺口維持 normal，唔另造一級。
 */
export type VitalBand = 'normal' | 'mild' | 'moderate' | 'severe';

const RANK: Record<VitalBand, number> = { normal: 0, mild: 1, moderate: 2, severe: 3 };

export function worseBand(left: VitalBand, right: VitalBand): VitalBand {
  return RANK[left] >= RANK[right] ? left : right;
}

function between(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

export function heartRateBand(hr: number): VitalBand {
  if (hr <= 39 || hr >= 130) return 'severe';
  if (between(hr, 40, 49) || between(hr, 111, 129)) return 'moderate';
  if (between(hr, 50, 59) || between(hr, 101, 110)) return 'mild';
  return 'normal';
}

export function spo2Band(spo2: number): VitalBand {
  if (spo2 <= 91) return 'severe';
  if (between(spo2, 92, 93)) return 'moderate';
  // 94–100 落在常用目標 94–98% 內，不當異常，數值不閃。
  return 'normal';
}

export function systolicBand(sbp: number): VitalBand {
  if (sbp <= 80 || sbp > 180) return 'severe';
  if (between(sbp, 81, 90) || between(sbp, 160, 180)) return 'moderate';
  if (between(sbp, 91, 99) || between(sbp, 140, 159)) return 'mild';
  // 100–139 係穩定血壓，121/73 這類讀數不閃。
  return 'normal';
}

export function diastolicBand(dbp: number): VitalBand {
  if (dbp < 40 || dbp > 110) return 'severe';
  if (between(dbp, 40, 49) || between(dbp, 91, 110)) return 'moderate';
  if (between(dbp, 50, 59) || dbp === 90) return 'mild';
  // 81–89 未到高血壓警戒，133/81 這類讀數不閃。
  return 'normal';
}

/** 畫面 MAP 用四捨五入。高警戒：SBP ≥140、DBP ≥90、MAP ≥100。 */
export function mapBand(sbp: number, dbp: number): VitalBand {
  const map = Math.round((sbp + 2 * dbp) / 3);
  return map >= 100 ? 'mild' : 'normal';
}

/** NIBP 同 ABP 共用。SBP、DBP、MAP 各自評級，取較差嘅一級。 */
export function bloodPressureBand(sbp: number, dbp: number): VitalBand {
  return worseBand(worseBand(systolicBand(sbp), diastolicBand(dbp)), mapBand(sbp, dbp));
}

export function respiratoryRateBand(rr: number): VitalBand {
  if (rr <= 8 || rr >= 30) return 'severe';
  if (between(rr, 25, 29)) return 'moderate';
  if (between(rr, 9, 11) || between(rr, 21, 24)) return 'mild';
  return 'normal';
}

/** 用畫面顯示嘅一位小數，所以 38.1 落在中度而唔會被浮點誤差撥走。 */
export function temperatureBand(celsius: number): VitalBand {
  const shown = Number(celsius.toFixed(1));
  if (shown < 34 || shown > 39) return 'severe';
  if (between(shown, 34, 35.4) || between(shown, 38.1, 39)) return 'moderate';
  if (between(shown, 35.5, 36) || between(shown, 37.3, 38)) return 'mild';
  return 'normal';
}

export function cvpBand(cvp: number): VitalBand {
  if (cvp > 15) return 'severe';
  if (cvp < 0 || between(cvp, 11, 15)) return 'moderate';
  if (between(cvp, 0, 1) || between(cvp, 7, 10)) return 'mild';
  return 'normal';
}

export function etco2Band(etco2: number): VitalBand {
  if (etco2 < 20 || etco2 > 60) return 'severe';
  if (between(etco2, 20, 29) || between(etco2, 51, 60)) return 'moderate';
  if (between(etco2, 30, 34) || between(etco2, 46, 50)) return 'mild';
  return 'normal';
}
