/** 電話（Call）嘅共用讀寫 helper：葉模組，calls／consult／family／arrestCall 都用，避免循環 import。 */
import type { ArrestAlertRow, CallResponseEffect, CallTemplateRow } from '../case/tables';
import { enqueue } from '../core/eventQueue';
import type { Effect } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { Call } from './wardTypes';

export const CALL_EXPIRE_EVENT = 'CALL_EXPIRE';
export const CALL_RING_AGAIN_EVENT = 'CALL_RING_AGAIN';
export const CONSULT_ARRIVAL_EVENT = 'CONSULT_ARRIVAL';
export const CALL_EVENT_PRIORITY = 20;
export const ARREST_TEMPLATE_ID = 'ARREST_ALERT';

export const notice = (
  kind: Extract<Effect, { type: 'NOTICE' }>['kind'],
  tone: 'info' | 'warn' = 'warn',
): Effect => ({
  type: 'NOTICE',
  kind,
  tone,
});

export function callTemplates(ctx: EngineContext): CallTemplateRow[] {
  return ctx.tables['call-templates'].filter((r): r is CallTemplateRow => r.kind === 'CALL');
}

export function arrestAlertRow(ctx: EngineContext): ArrestAlertRow | undefined {
  return ctx.tables['call-templates'].find((r): r is ArrestAlertRow => r.kind === 'ARREST_ALERT');
}

/** 來電對應嘅回應表：普通來電模板，或者心臟停頓來電 */
export function responsesOf(
  ctx: EngineContext,
  templateId: string,
): Readonly<Record<'GO_NOW' | 'LATER' | 'CONTINUE' | 'MISSED', CallResponseEffect>> | undefined {
  if (templateId === ARREST_TEMPLATE_ID) return arrestAlertRow(ctx)?.responses;
  return callTemplates(ctx).find((r) => r.id === templateId)?.responses;
}

export function putCall(state: GameState, call: Call): GameState {
  const exists = state.ward.calls.some((c) => c.id === call.id);
  return {
    ...state,
    ward: {
      ...state.ward,
      calls: exists
        ? state.ward.calls.map((c) => (c.id === call.id ? call : c))
        : [...state.ward.calls, call],
    },
  };
}

export function findCall(state: GameState, callId: string): Call | undefined {
  return state.ward.calls.find((c) => c.id === callId);
}

export function scheduleCallEvent(
  state: GameState,
  time: number,
  kind: string,
  payload: Record<string, string>,
): GameState {
  return {
    ...state,
    scheduler: enqueue(state.scheduler, { time, priority: CALL_EVENT_PRIORITY, kind, payload }),
  };
}

/** 玩家文字會當 template 存入 CallLine；'@' 開頭會被當成系統碼，所以加個空格避開 */
export function playerTemplate(text: string): string {
  return text.startsWith('@') ? ` ${text}` : text;
}
