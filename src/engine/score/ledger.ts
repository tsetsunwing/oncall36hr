/**
 * 分數 ledger：只增不減嘅事件記錄（回顧由 ledger＋action log 重建，implementation-plan §9）。
 * 幅度由 content 表決定；呢度只負責記錄，唔含任何數字。
 */
import type { LedgerEntry } from '../acls/resusState';
import type { GameState } from '../core/state';

export function addLedger(
  state: GameState,
  entry: Omit<LedgerEntry, 'id' | 't'> & { t?: number },
): GameState {
  const full: LedgerEntry = {
    ...entry,
    id: `sc${String(state.scoreLedger.length + 1)}`,
    t: entry.t ?? state.clock.t,
  };
  return { ...state, scoreLedger: [...state.scoreLedger, full] };
}

export function ledgerTotal(
  state: Pick<GameState, 'scoreLedger'>,
  category?: LedgerEntry['category'],
): number {
  return state.scoreLedger
    .filter((e) => category === undefined || e.category === category)
    .reduce((sum, e) => sum + e.delta, 0);
}
