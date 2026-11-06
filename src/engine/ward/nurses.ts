import type { NurseRosterRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';

const SHIFT_NIGHT_SEGMENT = 1;

/** 目前更次：NIGHT 全程夜更；ONCALL 按分段（日、夜、日）；其餘日更 */
export function currentShift(state: GameState, ctx: EngineContext): 'DAY' | 'NIGHT' {
  if (state.mode === 'NIGHT') return 'NIGHT';
  if (state.mode === 'DAY') return 'DAY';
  const segments = ctx.config.shifts.onCall.segmentHours;
  let elapsedHours = state.clock.t / 3600;
  for (let index = 0; index < segments.length; index++) {
    const length = segments[index] ?? 0;
    if (elapsedHours < length) return index === SHIFT_NIGHT_SEGMENT ? 'NIGHT' : 'DAY';
    elapsedHours -= length;
  }
  return 'DAY';
}

export function zoneOfBed(ctx: EngineContext, bed: number): string | null {
  for (const row of ctx.tables['ward-layout']) {
    if (row.kind === 'BED' && row.bed === bed) return row.zone;
  }
  return null;
}

/** 每區每更一位護士；冇對應區就用該更第一位 */
export function nurseForBed(
  state: GameState,
  ctx: EngineContext,
  bed: number,
): NurseRosterRow | undefined {
  const shift = currentShift(state, ctx);
  const roster = ctx.tables['nurse-roster'];
  const zone = zoneOfBed(ctx, bed);
  return (
    roster.find((n) => n.shift === shift && (zone === null || n.zone === zone)) ??
    roster.find((n) => n.shift === shift) ??
    roster[0]
  );
}
