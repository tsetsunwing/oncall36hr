/**
 * 會診同臨床來電到達時，把待辦列同一句寫入該病人對話紀錄一次。
 * 句子格式同 QueuePanel：`${bed} 號床 · ${來電原文}`。speaker id 綁住 call id，刷新或再響唔會再加。
 */
import { appendLine } from '../chat/dialogue';
import type { GameState } from '../core/state';
import type { Call } from './wardTypes';

const SPEAKER_PREFIX = 'call:';

export function incomingCallSpeakerId(callId: string): string {
  return `${SPEAKER_PREFIX}${callId}`;
}

export function logIncomingCall(state: GameState, call: Call): GameState {
  if (call.direction !== 'IN' || call.tag === 'FAMILY' || call.patientId === null) return state;
  const first = call.lines.find(
    (line) => line.speaker === 'CALLER' && !line.template.startsWith('@'),
  );
  const patientId = call.patientId;
  if (first?.tokenValues['patient.bed'] === undefined) return state;
  const thread = state.chats[patientId];
  const speakerId = incomingCallSpeakerId(call.id);
  if (!thread || thread.lines.some((line) => line.speaker.id === speakerId)) return state;
  return appendLine(state, {
    t: first.t,
    patientId,
    speaker: { kind: 'SYSTEM', id: speakerId },
    template: `{{patient.bed}} 號床 · ${first.template}`,
    tokenValues: first.tokenValues,
    orderId: null,
    source: 'PHONE',
  });
}
