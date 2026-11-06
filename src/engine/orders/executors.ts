/**
 * 執行者（spec §11、S-4）：護士、下屬同事、玩家自己。
 * 下屬只喺 MO／RES 有（HO 冇下屬，S-1 A）；下屬資歷、可靠度屬 M4（T15／T16），
 * 呢度只用 config 嘅「普通」速度倍數作為暫定值，唔擲可靠度、唔會出錯。
 */
import type { ExecutorKind, OrderCatalogRow } from '../case/tables';
import type { EngineConfig } from '../core/config';
import type { GameState } from '../core/state';

export function availableExecutors(state: GameState): ExecutorKind[] {
  if (state.ward.enabled) {
    const sub = state.ward.sub;
    const free = sub !== null && sub.busyUntil <= state.clock.t;
    return free ? ['NURSE', 'SUBORDINATE', 'PLAYER'] : ['NURSE', 'PLAYER'];
  }
  return state.playerRank === 'HO' ? ['NURSE', 'PLAYER'] : ['NURSE', 'SUBORDINATE', 'PLAYER'];
}

/** 揀執行者：玩家（或 AI 標籤）指定而且允許、有人手就用；否則用 catalog 列表第一個可用者 */
export function chooseExecutor(
  state: GameState,
  row: OrderCatalogRow,
  preferred: ExecutorKind | null,
): ExecutorKind {
  const available = availableExecutors(state);
  const allowed = row.executors.filter((kind) => available.includes(kind));
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0] ?? row.executors[0] ?? 'NURSE';
}

export function executorDurationSec(
  kind: ExecutorKind,
  baseSec: number,
  config: EngineConfig,
): number {
  const multiplier = kind === 'SUBORDINATE' ? config.staff.speedMultiplier.NORMAL : 1;
  return Math.round(baseSec * multiplier);
}

export function executorRef(kind: ExecutorKind, nurseId: string | null): string | null {
  switch (kind) {
    case 'NURSE':
      return nurseId;
    case 'PLAYER':
      return 'player';
    case 'SUBORDINATE':
      return 'sub:1';
  }
}
