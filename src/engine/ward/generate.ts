/**
 * 病人集生成（T12、S-5 B）：佔床率按難度；病情複雜度取「難度」同「職級」較高者。
 * 全部隨機來自 events／staff／calls 分流，所以同 seed 必定生成同一個病房。
 */
import { createPatientState } from '../case/caseModule';
import type { CaseTemplateRow, DifficultyProfileRow } from '../case/tables';
import { enqueue } from '../core/eventQueue';
import type { EngineConfig } from '../core/config';
import type { EngineContext } from '../core/module';
import type { GameState, Mode } from '../core/state';
import { buildChat } from './generateChat';
import { RngCursor } from './rngCursor';
import { RANKS, type Rank } from './wardTypes';

export const CALL_ARRIVAL_EVENT = 'CALL_ARRIVAL';
export const CALL_ARRIVAL_PRIORITY = 20;

export function shiftSeconds(config: EngineConfig, mode: Mode): number {
  switch (mode) {
    case 'DAY':
      return config.shifts.day.regularSeconds;
    case 'NIGHT':
      return config.shifts.night.regularSeconds;
    case 'ONCALL':
      return config.shifts.onCall.regularSeconds;
  }
}

/** T12：來電總數 ＝ 每小時基礎量 × 更次時數 × (1 ＋ 難度加成)，四捨五入 */
export function plannedCallCount(config: EngineConfig, mode: Mode, uplift: number): number {
  const hours = shiftSeconds(config, mode) / 3600;
  return Math.round(config.phone.baseCallsPerHour * hours * (1 + uplift));
}

export function effectiveComplexity(
  profile: DifficultyProfileRow,
  rankLevel: number,
  profiles: readonly DifficultyProfileRow[],
): { level: number; ratio: number } {
  const level = Math.max(profile.complexityLevel, rankLevel);
  const source = profiles.find((p) => p.complexityLevel === level) ?? profile;
  return { level, ratio: source.complexRatio };
}

export function bedsOf(ctx: EngineContext): number[] {
  const beds: number[] = [];
  for (const row of ctx.tables['ward-layout']) if (row.kind === 'BED') beds.push(row.bed);
  return beds.sort((a, b) => a - b);
}

function pickTemplates(
  cursor: RngCursor,
  all: readonly CaseTemplateRow[],
  count: number,
  complexRatio: number,
): CaseTemplateRow[] {
  const complex = cursor.shuffle(
    'events',
    all.filter((t) => t.complexity === 'COMPLEX'),
  );
  const simple = cursor.shuffle(
    'events',
    all.filter((t) => t.complexity === 'SIMPLE'),
  );
  const wantComplex = Math.min(complex.length, Math.round(count * complexRatio));
  const wantSimple = Math.min(simple.length, count - wantComplex);
  const chosen = [...complex.slice(0, wantComplex), ...simple.slice(0, wantSimple)];
  // 先用未揀中嘅模板填滿；模板少過床位時（例如外科病房暫時只有幾個病例）就重複使用
  const fill = [...complex.slice(wantComplex), ...simple.slice(wantSimple)];
  let index = 0;
  while (chosen.length < count && fill.length > 0) {
    const next = fill[index % fill.length];
    if (next) chosen.push(next);
    index += 1;
  }
  return cursor.shuffle('events', chosen);
}

export function generateWard(
  state: GameState,
  ctx: EngineContext,
  forcedCaseId?: string,
): GameState {
  const { tables, config } = ctx;
  const profile = tables['difficulty-profiles'].find((p) => p.id === state.difficulty);
  if (!profile) return state;
  const rankRow = tables['rank-complexity'].find((r) => r.id === state.playerRank);
  const { ratio } = effectiveComplexity(
    profile,
    rankRow?.complexityLevel ?? 1,
    tables['difficulty-profiles'],
  );

  const cursor = new RngCursor(state.rng);
  const beds = bedsOf(ctx);
  const count = Math.min(
    beds.length,
    cursor.int('events', profile.occupancy.min, profile.occupancy.max + 1),
  );
  const occupied = cursor
    .shuffle('events', beds)
    .slice(0, count)
    .sort((a, b) => a - b);
  // 只抽屬於呢個病房嘅病例；病房冇專屬病例就退回全表，唔會出現空病房
  const wardCode = state.ward.code;
  const inWard = tables['case-templates'].filter((t) => t.wards.includes(wardCode));
  const pool = inWard.length > 0 ? inWard : tables['case-templates'];
  const templates = pickTemplates(cursor, pool, occupied.length, ratio);
  const forced = tables['case-templates'].find((t) => t.id === forcedCaseId);
  if (forced && templates.length > 0) templates[0] = forced;

  let next: GameState = { ...state, rng: cursor.rng };
  occupied.forEach((bed, index) => {
    const template = templates[index];
    if (!template) return;
    next = createPatientState(next, template, ctx, {
      id: `p${String(index + 1)}`,
      bed,
      logStart: false,
    });
  });

  let chats = next.chats;
  for (const patient of Object.values(next.patients)) {
    chats = { ...chats, [patient.id]: buildChat(next, patient, ctx) };
  }
  next = { ...next, chats };

  const staff = new RngCursor(next.rng);
  const subRank = state.playerRank === 'MO' ? 'HO' : state.playerRank === 'RES' ? 'MO' : null;
  const candidates = tables.subordinates.filter((s) => s.rank === subRank);
  const picked =
    subRank && candidates.length > 0
      ? candidates[staff.int('staff', 0, candidates.length)]
      : undefined;
  const sub = picked
    ? { id: picked.id, rank: picked.rank, name: picked.name, level: picked.level, busyUntil: 0 }
    : null;

  const calls = new RngCursor(staff.rng);
  const total = plannedCallCount(config, state.mode, profile.phoneVolumeUplift);
  const window = shiftSeconds(config, state.mode);
  const first = config.phone.firstCallAfterSec;
  const times = Array.from({ length: total }, () =>
    calls.int('calls', first, Math.max(first + 1, window)),
  );
  times.sort((a, b) => a - b);
  let scheduler = next.scheduler;
  times.forEach((time, index) => {
    scheduler = enqueue(scheduler, {
      time,
      priority: CALL_ARRIVAL_PRIORITY,
      kind: CALL_ARRIVAL_EVENT,
      payload: { n: index },
    });
  });

  const impressions: Record<string, number> = {};
  for (const rank of RANKS) impressions[rank] = config.staff.rankImpression.start;

  return {
    ...next,
    rng: calls.rng,
    scheduler,
    ward: {
      ...next.ward,
      enabled: true,
      generated: true,
      sub,
      impressions,
      plannedCalls: total,
    },
  };
}

export function rankAbove(rank: Rank): Rank[] {
  const index = RANKS.indexOf(rank);
  return RANKS.slice(index + 1);
}
