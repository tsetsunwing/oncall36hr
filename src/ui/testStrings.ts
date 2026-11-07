const SAMPLE_ARGS: readonly unknown[] = ['甲', 3, 5, 7, 9];

/** 收集字串；模板函數以樣本參數展開，令語氣審查涵蓋動態句子 */
export function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    try {
      const out = (value as (...args: unknown[]) => unknown)(...SAMPLE_ARGS);
      return typeof out === 'string' ? [out] : [];
    } catch {
      return [];
    }
  }
  if (typeof value === 'object' && value !== null)
    return Object.values(value).flatMap(collectStrings);
  return [];
}
