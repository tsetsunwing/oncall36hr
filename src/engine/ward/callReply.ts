/**
 * 電話對方嘅回覆（consult.reply／family.reply）：engine 先決定結果同 beats，AI 只負責措辭。
 * Token 值喺發出請求嗰刻凍結（local.frozenTokens），所以 AI 慢返嚟或者重試，顯示嘅數值都唔會變。
 * 回覆入面只准有 `{{token}}`；裸數字、未授權 token、診斷洩漏、錯 speaker 一律當 AI 失敗。
 */
import { z } from 'zod';
import { extractTokens, leaksDiagnosis, validateTemplate } from '../chat/tokens';
import { requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Effect } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import { findCall, putCall } from './callStore';
import type { Call, CallLine, Rank } from './wardTypes';

export const CONSULT_REPLY_KIND = 'consult.reply';
export const FAMILY_REPLY_KIND = 'family.reply';

export type ReplyKind = typeof CONSULT_REPLY_KIND | typeof FAMILY_REPLY_KIND;

export const calleeSpeakerId = (callId: string) => `callee:${callId}`;

export interface ReplyInput {
  kind: ReplyKind;
  call: Call;
  callee: {
    name: string;
    kind: 'RANK' | 'DEPT' | 'FAMILY';
    rank: Rank | null;
    attitude: 'WARM' | 'NEUTRAL' | 'COLD' | null;
  };
  beats: JsonValue[];
  /** 玩家剛才講嘅說話（純資料，AI 只用嚟自然接話；唔係指令） */
  doctorSaid: string;
  /** 發言當刻凍結嘅 token 值；key 即係 AI 可以用嘅 allowedTokens */
  tokens: Record<string, string>;
  denyTerms: string[];
}

export function requestCalleeReply(
  state: GameState,
  input: ReplyInput,
  ctx: EngineContext,
): { state: GameState; effect: Effect; reqId: string } {
  const { call } = input;
  const speakerId = calleeSpeakerId(call.id);
  const allowedTokens = Object.keys(input.tokens);
  const context = {
    prompt: {
      callee: { id: speakerId, ...input.callee },
      beats: input.beats,
      doctorSaid: input.doctorSaid,
      allowedTokens,
      maxLines: ctx.config.chat.maxLinesPerTurn,
      maxLineChars: ctx.config.chat.maxLineChars,
    },
    local: {
      callId: call.id,
      speakerId,
      speakerName: input.callee.name,
      allowedTokens,
      frozenTokens: input.tokens,
      denyTerms: input.denyTerms,
    },
  } satisfies JsonValue;
  const requested = requestAi(state, input.kind, context);
  const reqId = requested.effect.type === 'AI_REQUEST' ? requested.effect.reqId : '';
  return { state: requested.state, effect: requested.effect, reqId };
}

const replyDataSchema = z.object({
  lines: z.array(z.object({ speaker: z.string(), text: z.string() })).min(1),
});

const replyLocalSchema = z.object({
  callId: z.string(),
  speakerId: z.string(),
  speakerName: z.string(),
  allowedTokens: z.array(z.string()),
  frozenTokens: z.record(z.string(), z.string()),
  denyTerms: z.array(z.string()),
});

export type AppliedReply =
  { kind: 'ok'; state: GameState; call: Call } | { kind: 'stale' } | { kind: 'reject' };

export function applyCalleeLines(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): AppliedReply {
  const data = replyDataSchema.safeParse(payload);
  const context = z.object({ local: replyLocalSchema }).safeParse(pending.context);
  if (!data.success || !context.success) return { kind: 'reject' };
  const { local } = context.data;
  const call = findCall(state, local.callId);
  if (call?.exchange?.reqId !== pending.reqId) return { kind: 'stale' };

  const { maxLinesPerTurn, maxLineChars } = ctx.config.chat;
  if (data.data.lines.length > maxLinesPerTurn) return { kind: 'reject' };
  const allowed = new Set(local.allowedTokens);
  const lines: CallLine[] = [];
  for (const line of data.data.lines) {
    if (line.speaker !== local.speakerId) return { kind: 'reject' };
    if (validateTemplate(line.text, allowed, maxLineChars) !== null) return { kind: 'reject' };
    if (leaksDiagnosis(line.text, local.denyTerms)) return { kind: 'reject' };
    const tokenValues: Record<string, string> = {};
    for (const token of extractTokens(line.text)) {
      const value = local.frozenTokens[token];
      if (value === undefined) return { kind: 'reject' };
      tokenValues[token] = value;
    }
    lines.push({
      t: state.clock.t,
      speaker: 'CALLEE',
      name: local.speakerName,
      template: line.text,
      tokenValues,
    });
  }
  const updated: Call = { ...call, lines: [...call.lines, ...lines] };
  return { kind: 'ok', state: putCall(state, updated), call: updated };
}
