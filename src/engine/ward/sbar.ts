/** SBAR 預填：全部由 state 同 T17 SBAR_PREFILL 模板生成，唔係 AI 文字（S-7） */
import { abnormalOf, patientTokens, vitalTokens } from '../chat/dialogue';
import { renderTemplate } from '../chat/tokens';
import type { DeathSbarRow, SbarPrefillRow } from '../case/tables';
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

function sbarValues(
  state: GameState,
  patientId: string,
  target: CallTarget,
  ctx: EngineContext,
): Record<string, string> | undefined {
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
  return {
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
}

export function buildSbarDraft(
  state: GameState,
  patientId: string,
  target: CallTarget,
  ctx: EngineContext,
): Sbar | undefined {
  const prefill = sbarPrefillRow(ctx);
  const values = sbarValues(state, patientId, target, ctx);
  if (!prefill || !values) return undefined;
  return {
    S: renderTemplate(prefill.S, values),
    B: renderTemplate(prefill.B, values),
    A: renderTemplate(prefill.A, values),
    R: renderTemplate(prefill.R, values),
  };
}

/** 死亡後通知上一級：用 T17 DEATH_SBAR 預填，死因同搶救摘要全部由 case／死亡狀態映射 */
export function buildDeathSbarDraft(
  state: GameState,
  patientId: string,
  target: CallTarget,
  ctx: EngineContext,
): Sbar | undefined {
  const row = ctx.tables['call-templates'].find((r): r is DeathSbarRow => r.kind === 'DEATH_SBAR');
  const base = sbarValues(state, patientId, target, ctx);
  const death = state.death[patientId];
  const patient = state.patients[patientId];
  if (!row || !base || !death || !patient) return undefined;
  const template = ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  const values: Record<string, string> = {
    ...base,
    'death.cause': template?.deathCause ?? '',
    'death.cycles': String(death.summary.cycles),
    'death.shocks': String(death.summary.shocks),
    'death.drugs': String(death.summary.drugs),
  };
  return {
    S: renderTemplate(row.S, values),
    B: renderTemplate(row.B, values),
    A: renderTemplate(row.A, values),
    R: renderTemplate(row.R, values),
  };
}
