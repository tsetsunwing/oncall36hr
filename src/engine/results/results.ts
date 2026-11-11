/**
 * 化驗／檢查結果（T7）：order 完成（採樣／拍攝）後，按表內延遲排程報告；
 * 報告內容由 T7 按「採樣當刻」嘅 case 狀態查表產生，AI 只負責護士口頭通知（唔寫數值）。
 */
import { z } from 'zod';
import { patientTokens, queueDialogue, vitalTokens, type Beat } from '../chat/dialogue';
import { renderTemplate } from '../chat/tokens';
import type { Patient, PatientReport } from '../case/patient';
import type { OrderCatalogRow, ResultItemRow, ResultRow } from '../case/tables';
import { enqueue } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import { updateOrderLog } from '../log/log';
import { composeOrderLabel } from '../orders/label';
import type { Order } from '../orders/orderTypes';

export const RESULT_REPORT_EVENT_KIND = 'RESULT_REPORT';

/** 採樣／拍攝完成：order 進入「等報告」，並排程報告時間 */
export function scheduleResultReport(
  state: GameState,
  orderId: string,
  sampledState: string,
  row: OrderCatalogRow,
  ctx: EngineContext,
): GameState {
  const order = state.orders[orderId];
  const result = ctx.tables.results.find((r) => r.id === row.resultId);
  if (!order || !result) return state;
  const marked: Order = { ...order, resultStatus: 'PENDING', sampledState };
  return {
    ...state,
    orders: { ...state.orders, [orderId]: marked },
    scheduler: enqueue(state.scheduler, {
      time: state.clock.t + result.reportDelaySec,
      kind: RESULT_REPORT_EVENT_KIND,
      payload: { orderId },
    }),
  };
}

function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function flagOf(value: number, item: ResultItemRow): 'H' | 'L' | null {
  if (value < item.ref.low) return 'L';
  if (value > item.ref.high) return 'H';
  return null;
}

function pickByState<T>(byState: Readonly<Record<string, T>>, state: string): T | undefined {
  return byState[state] ?? byState['*'];
}

/**
 * 報告內容先按診斷、再按狀態揀。次序：
 * 診斷＋狀態 → 診斷＋'*' → 任何診斷＋狀態 → 任何診斷＋'*'。
 * 診斷有寫過就唔會退回通用值，避免「肺炎片」出現在肺栓塞病人身上。
 */
export function pickByDiagnosisAndState<T>(
  byDiagnosis: Readonly<Record<string, Readonly<Record<string, T>>>> | undefined,
  diagnosisIds: readonly string[],
  byState: Readonly<Record<string, T>>,
  state: string,
): T | undefined {
  for (const diagnosisId of diagnosisIds) {
    const bucket = byDiagnosis?.[diagnosisId];
    if (!bucket) continue;
    const hit = pickByState(bucket, state);
    if (hit !== undefined) return hit;
  }
  return pickByState(byState, state);
}

export function buildReport(
  order: Order,
  result: ResultRow,
  patient: Patient,
  label: string,
  ctx: EngineContext,
  t: number,
): PatientReport {
  const base = {
    id: `rep:${order.id}`,
    orderId: order.id,
    resultId: result.id,
    label,
    reportedAt: t,
    reviewStatus: result.reviewStatus,
  };
  const state = order.sampledState ?? patient.hidden.fsm.state;
  const diagnosisIds = patient.hidden.diagnosisIds;
  if (result.kind === 'PANEL') {
    const items = result.items.flatMap((item) => {
      const value = pickByDiagnosisAndState(item.byDiagnosis, diagnosisIds, item.byState, state);
      if (value === undefined) return [];
      return [
        {
          label: item.label,
          valueText: `${formatNumber(value, item.decimals)}${item.unit ? ` ${item.unit}` : ''}`,
          refText: `${formatNumber(item.ref.low, item.decimals)}–${formatNumber(item.ref.high, item.decimals)}`,
          flag: flagOf(value, item),
        },
      ];
    });
    return {
      ...base,
      kind: 'PANEL',
      abnormal: items.some((i) => i.flag !== null),
      items,
      text: null,
    };
  }
  const entry = pickByDiagnosisAndState(
    result.textByDiagnosis,
    diagnosisIds,
    result.textByState,
    state,
  );
  const tokens = { ...vitalTokens(patient, ctx.tables), ...patientTokens(patient) };
  return {
    ...base,
    kind: 'REPORT',
    abnormal: entry?.abnormal ?? false,
    items: [],
    text: renderTemplate(entry?.text ?? '', tokens),
  };
}

export function reportSummaryText(report: PatientReport): string {
  return report.kind === 'PANEL'
    ? report.items
        .map((item) => `${item.label} ${item.valueText}${item.flag ? ` ${item.flag}` : ''}`)
        .join('，')
    : (report.text ?? '');
}

/** 每個檢查只保留最近幾份報告，夠看走勢又唔會無限增長。 */
export const REPORTS_KEPT_PER_TEST = 5;

export function capReports(reports: readonly PatientReport[], resultId: string): PatientReport[] {
  const same = reports.filter((item) => item.resultId === resultId);
  if (same.length <= REPORTS_KEPT_PER_TEST) return [...reports];
  const drop = same.length - REPORTS_KEPT_PER_TEST;
  const dropped = new Set(same.slice(0, drop));
  return reports.filter((item) => !dropped.has(item));
}

export function handleResultReport(
  state: GameState,
  payload: unknown,
  ctx: EngineContext,
): Reduction {
  const parsed = z.object({ orderId: z.string() }).safeParse(payload);
  const order = parsed.success ? state.orders[parsed.data.orderId] : undefined;
  if (order?.resultStatus !== 'PENDING') return { state, effects: [] };
  const patient = state.patients[order.patientId];
  const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
  const result = ctx.tables.results.find((r) => r.id === row?.resultId);
  if (!patient || !row || !result) return { state, effects: [] };

  const label = composeOrderLabel(row, order);
  const report = buildReport(order, result, patient, label, ctx, state.clock.t);
  let next: GameState = {
    ...state,
    orders: { ...state.orders, [order.id]: { ...order, resultStatus: 'REPORTED' } },
    patients: {
      ...state.patients,
      [patient.id]: {
        ...patient,
        visible: {
          ...patient.visible,
          reports: capReports([...patient.visible.reports, report], report.resultId),
        },
      },
    },
  };
  next = updateOrderLog(next, order.id, { resultText: reportSummaryText(report) });

  const beat: Beat = {
    type: 'REPORT_LAB_READY',
    speaker: 'NURSE',
    labelToken: 'order.1.label',
    abnormal: report.abnormal,
  };
  const queued = queueDialogue(
    next,
    {
      patientId: patient.id,
      beats: [beat],
      tokens: { ...patientTokens(patient), 'order.1.label': label },
      addressed: [],
      resolvedOrder: { catalogId: order.catalogId, label },
    },
    ctx,
  );
  return queued
    ? { state: queued.state, effects: queued.effect ? [queued.effect] : [] }
    : { state: next, effects: [] };
}

export const resultsModule: EngineModule = {
  name: 'results',
  handleScheduled(state, event, ctx) {
    if (event.kind !== RESULT_REPORT_EVENT_KIND) return undefined;
    return handleResultReport(state, event.payload, ctx);
  },
};
