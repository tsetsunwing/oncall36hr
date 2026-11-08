/**
 * 護士短句（收到、已執行、量完生命體徵）由系統模板寫出。
 * 句中數字只可以係 {{token}}，值來自狀態機，唔交俾模型。
 */
import type { Beat } from './dialogue';

const VITAL_CHECK_TOKENS = [
  'vital.hr',
  'vital.sbp',
  'vital.dbp',
  'vital.spo2',
  'vital.rr',
  'vital.temp',
  'mews.score',
] as const;

const VITAL_CHECK = new Set<string>(VITAL_CHECK_TOKENS);

const VITAL_CHECK_LINE =
  '量完生命體徵：HR {{vital.hr}}，BP {{vital.sbp}}/{{vital.dbp}}，SpO2 {{vital.spo2}}%，RR {{vital.rr}}，Temp {{vital.temp}}，MEWS {{mews.score}}。';

function isVitalCheck(tokens: readonly string[]): boolean {
  return tokens.length === VITAL_CHECK.size && tokens.every((token) => VITAL_CHECK.has(token));
}

/** 可以本地寫出就返回模板；其餘 beat（包括含其他數值嘅結果）繼續交俾對白模型。 */
export function shortReplyTemplate(beat: Beat): string | null {
  if (beat.type === 'ACK_ORDER') {
    const label = `{{${beat.labelToken}}}`;
    if (beat.executor === 'PLAYER') return `收到，你自己做 ${label}。`;
    if (beat.executor === 'SUBORDINATE') return `收到，下屬同事做 ${label}。`;
    return `收到，我即刻做 ${label}。`;
  }
  if (beat.type !== 'REPORT_RESULT') return null;
  if (isVitalCheck(beat.tokens)) return VITAL_CHECK_LINE;
  if (beat.tokens.length === 0) return `已執行 {{${beat.labelToken}}}。`;
  return null;
}
