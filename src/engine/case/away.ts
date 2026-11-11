/**
 * 病人離開病房（放射科、內窺鏡等）。
 * 不另存狀態：由「正在進行、而且目錄寫明要離開病房」的 order 即時推出來，
 * 所以取消 order 會即刻恢復，存檔亦不需要升級。
 */
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';

export interface AwayState {
  /** 病人返房的時間（遊戲秒） */
  until: number;
  /** 去哪裡，例如「CT thorax」 */
  place: string;
}

export function awayOf(state: GameState, patientId: string, ctx: EngineContext): AwayState | null {
  let away: AwayState | null = null;
  for (const order of Object.values(state.orders)) {
    if (order.patientId !== patientId || order.status !== 'RUNNING') continue;
    const row = ctx.tables['order-catalog'].find((item) => item.id === order.catalogId);
    const seconds = row?.leavesWardSec ?? 0;
    if (seconds <= 0) continue;
    const until = order.startsAt + seconds;
    if (until <= state.clock.t) continue;
    if (!away || until > away.until) away = { until, place: row?.label ?? '' };
  }
  return away;
}

/** 病人身上有無對比劑篩查旗標（問過過敏同懷孕）。 */
export const CONTRAST_SCREENED_FLAG = 'contrast.screened';

export function contrastScreened(state: GameState, patientId: string): boolean {
  const patient = state.patients[patientId];
  return patient?.hidden.fsm.flags.includes(CONTRAST_SCREENED_FLAG) ?? false;
}
