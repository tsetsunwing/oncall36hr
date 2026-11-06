/**
 * 把關請求（gate.pharmacy／gate.nurse／gate.danger）嘅 context 組裝。
 * B6：prompt 只含病人可見資料同 order 事實，唔含隱藏診斷、FSM 狀態、護士資歷。
 */
import { patientTokens, vitalTokens } from '../chat/dialogue';
import type { Patient } from '../case/patient';
import type { OrderCatalogRow } from '../case/tables';
import { requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Effect } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { composeOrderLabel } from '../orders/label';
import type { Order } from '../orders/orderTypes';
import type { GateRole } from './gateTypes';
import { CONCERN_CATEGORIES } from '../case/tables';

export const GATE_PHARMACY_KIND = 'gate.pharmacy';
export const GATE_NURSE_KIND = 'gate.nurse';
export const GATE_DANGER_KIND = 'gate.danger';

export const GATE_ROLE_KIND: Record<GateRole, string> = {
  PHARMACY: GATE_PHARMACY_KIND,
  NURSE: GATE_NURSE_KIND,
};

/** 把關者對白可用嘅 token（數值由 engine 凍結，AI 唔可以自己寫數字） */
export const GATE_TOKENS = [
  'order.label',
  'order.dose',
  'order.drug',
  'patient.allergies',
  'vital.hr',
  'vital.sbp',
  'vital.dbp',
  'vital.spo2',
  'vital.rr',
  'mews.score',
] as const;

function titleCase(id: string): string {
  return id.length === 0 ? id : `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

export function allergyText(patient: Patient): string {
  return patient.allergies.length === 0 ? 'NKDA' : patient.allergies.map(titleCase).join(', ');
}

function reportSummaries(patient: Patient): string[] {
  return patient.visible.reports.map((report) => {
    const body =
      report.kind === 'PANEL'
        ? report.items
            .map((item) => `${item.label} ${item.valueText}${item.flag ? ` (${item.flag})` : ''}`)
            .join(', ')
        : (report.text ?? '');
    return `${report.label}: ${body}`;
  });
}

function currentDrugs(
  state: GameState,
  patientId: string,
  exceptOrderId: string,
  ctx: EngineContext,
) {
  return Object.values(state.orders)
    .filter(
      (o) =>
        o.patientId === patientId &&
        o.id !== exceptOrderId &&
        (o.status === 'RUNNING' || o.status === 'DONE'),
    )
    .flatMap((o) => {
      const row = ctx.tables['order-catalog'].find((r) => r.id === o.catalogId);
      return row?.type === 'DRUG' ? [composeOrderLabel(row, o)] : [];
    });
}

export function gateTokens(
  patient: Patient,
  order: Order,
  row: OrderCatalogRow,
  ctx: EngineContext,
): Record<string, string> {
  const formulary = row.formularyId
    ? ctx.tables.formulary.find((f) => f.id === row.formularyId)
    : undefined;
  const dose = order.params.dose
    ? `${String(order.params.dose.value)} ${order.params.dose.unit}`
    : '未指定劑量';
  return {
    ...vitalTokens(patient, ctx.tables),
    ...patientTokens(patient),
    'order.label': composeOrderLabel(row, order),
    'order.dose': dose,
    'order.drug': formulary?.label ?? row.label,
    'patient.allergies': allergyText(patient),
  };
}

function orderFacts(row: OrderCatalogRow, order: Order, ctx: EngineContext) {
  const formulary = row.formularyId
    ? ctx.tables.formulary.find((f) => f.id === row.formularyId)
    : undefined;
  return {
    label: composeOrderLabel(row, order),
    type: row.type,
    drug: formulary
      ? {
          name: formulary.label,
          drugClass: formulary.drugClass,
          allergyClasses: [...formulary.allergyClasses],
          dose: order.params.dose,
          route: order.params.route,
          typicalDose: formulary.typicalDose,
          units: [...formulary.units],
          routes: [...formulary.routes],
        }
      : null,
  };
}

export function patientFacts(state: GameState, patient: Patient, order: Order, ctx: EngineContext) {
  const v = patient.visible.vitals;
  return {
    age: patient.demographics.age,
    sex: patient.demographics.sex,
    allergies: [...patient.allergies],
    currentDrugs: currentDrugs(state, patient.id, order.id, ctx),
    reports: reportSummaries(patient),
    vitals: { hr: v.hr, sbp: v.sbp, dbp: v.dbp, spo2: v.spo2, rr: v.rr, temp: v.temp },
    mews: patient.visible.mews.score,
  };
}

export function requestGateReview(
  state: GameState,
  order: Order,
  row: OrderCatalogRow,
  role: GateRole,
  nurseId: string | null,
  ctx: EngineContext,
): { state: GameState; reqId: string; effect: Effect } | undefined {
  const patient = state.patients[order.patientId];
  if (!patient) return undefined;
  const tokens = gateTokens(patient, order, row, ctx);
  const allowedTokens = [...GATE_TOKENS];
  const frozen: Record<string, string> = {};
  for (const token of allowedTokens) frozen[token] = tokens[token] ?? '—';
  const template = ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  const context = {
    prompt: {
      role,
      order: orderFacts(row, order, ctx),
      patient: patientFacts(state, patient, order, ctx),
      concernCategories: [...CONCERN_CATEGORIES],
      maxConcerns: ctx.config.gate.maxConcerns,
      allowedTokens,
      maxLineChars: ctx.config.chat.maxLineChars,
    },
    local: {
      orderId: order.id,
      patientId: patient.id,
      role,
      nurseId,
      allowedTokens,
      frozenTokens: frozen,
      denyTerms: template ? [...template.diagnosisTerms] : [],
    },
  } satisfies JsonValue;
  const requested = requestAi(state, GATE_ROLE_KIND[role], context);
  const reqId = requested.effect.type === 'AI_REQUEST' ? requested.effect.reqId : '';
  return { state: requested.state, reqId, effect: requested.effect };
}

export function requestDanger(
  state: GameState,
  order: Order,
  row: OrderCatalogRow,
  ctx: EngineContext,
): { state: GameState; reqId: string; effect: Effect } | undefined {
  const patient = state.patients[order.patientId];
  if (!patient) return undefined;
  const concerns = (order.gate?.reviews ?? []).flatMap((review) =>
    review.concerns.map((c) => ({ by: review.by, category: c.category })),
  );
  const context = {
    prompt: {
      order: orderFacts(row, order, ctx),
      patient: patientFacts(state, patient, order, ctx),
      concerns,
      concernCategories: [...CONCERN_CATEGORIES],
    },
    local: { orderId: order.id, patientId: patient.id },
  } satisfies JsonValue;
  const requested = requestAi(state, GATE_DANGER_KIND, context);
  const reqId = requested.effect.type === 'AI_REQUEST' ? requested.effect.reqId : '';
  return { state: requested.state, reqId, effect: requested.effect };
}
