/** 共用掃描位置：所有波形用同一個牆鐘相位，擦除線先後對齊。 */
export function sweepColumn(nowMs: number, sweepSeconds: number, width: number): number {
  if (sweepSeconds <= 0 || width <= 0) return 0;
  const cycleMs = sweepSeconds * 1000;
  const wrapped = ((nowMs % cycleMs) + cycleMs) % cycleMs;
  return Math.floor((wrapped / cycleMs) * width) % width;
}
