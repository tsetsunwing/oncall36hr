/** SBAR 預填：全部由 state 同 T17 SBAR_PREFILL 模板生成，唔係 AI 文字（S-7） */
import { abnormalOf, patientTokens, vitalTokens } from '../chat/dialogue';
import { renderTemplate } from '../chat/tokens';
import type { SbarPrefillRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { composeOrderLabel } from '../orders/label';
import type { CallTarget, Sbar } from './wardTypes';

export function sbarPrefillRow(ctx: EngineContext): SbarPrefillRow | undefined {
  for (const row of ctx.tables['call-templates']) {
    if (row.kind === 'SBAR_PREFILL') return row;
  }
  return undefined;
}

export function buildSbarDraft(
  state: GameState,
  patientId: string,
  target: CallTarget,
  ctx: EngineContext,
): Sbar | undefined {
  const prefill = sbarPrefillRow(ctx);
  const patient = state.patients[patientId];
  if (!prefill || !patient) return undefined;

  const abnormal = abnormalOf(patient, ctx.tables)
    .map((a) => `${prefill.abnormalLabels[a.key] ?? a.key}${prefill.directionLabels[a.direction]}`)
    .join('、');
  const orders = Object.values(state.orders)
    .filter((o) => o.patientId === patientId && (o.status === 'RUNNING' || o.status === 'DONE'))
    .slice(-5)
    .map((o) =>
      composeOrderLabel(
        ctx.tables['order-catalog'].find((r) => r.id === o.catalogId),
        o,
      ),
    )
    .join('、');
  const values: Record<string, string> = {
    ...vitalTokens(patient, ctx.tables),
    ...patientTokens(patient),
    'patient.age': String(patient.demographics.age),
    'patient.sex': prefill.sexLabels[patient.demographics.sex],
    'patient.complaint': patient.presentingComplaint,
    'patient.allergies':
      patient.allergies.length > 0 ? patient.allergies.join('、') : prefill.noAllergy,
    'patient.orders': orders.length > 0 ? orders : prefill.noOrders,
    'patient.abnormal': abnormal.length > 0 ? abnormal : prefill.noAbnormal,
    'target.request': target.kind === 'RANK' ? prefill.RByTarget.RANK : prefill.RByTarget.DEPT,
  };
  return {
    S: renderTemplate(prefill.S, values),
    B: renderTemplate(prefill.B, values),
    A: renderTemplate(prefill.A, values),
    R: renderTemplate(prefill.R, values),
  };
}

/** 清晰度 0–3：四段齊全＝3；每缺一段降一級；至多得一段＝0 */
export function sbarClarity(sbar: Sbar): number {
  const filled = [sbar.S, sbar.B, sbar.A, sbar.R].filter((part) => part.trim().length > 0).length;
  return Math.max(0, filled - 1);
}
