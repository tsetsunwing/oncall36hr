/**
 * 回顧資料（spec §19.2）：全部由 ledger、action log、電話紀錄同 order 把關紀錄重建，
 * 冇任何 AI 自由文字直接成為事實；AI 安全理由要經 token 守衛先會顯示，否則回顧改用 engine 事實句。
 */
import type { EngineTables } from '../case/tables';
import type { GameState } from '../core/state';
import { safeReviewText } from '../gate/reviewText';
import { composeOrderLabel } from '../orders/label';
import { summariseRun, type RunSummary } from '../score/grading';
import type { LedgerEntry, SubscoreCode } from '../score/ledgerTypes';

type ReviewTables = EngineTables;

export interface ReviewPatientRef {
  patientId: string | null;
  bed: number | null;
  name: string | null;
}

export interface ReviewEntry extends ReviewPatientRef {
  id: string;
  t: number;
  subscore: SubscoreCode;
  rule: string;
  delta: number;
  callId: string | null;
  evidenceRef: string | null;
  facts: Readonly<Record<string, number | string>>;
}

export type TimelineKind = 'ORDER' | 'EVENT' | 'CALL' | 'SCORE';

export interface TimelineItem extends ReviewPatientRef {
  key: string;
  t: number;
  kind: TimelineKind;
  code: string;
  label: string | null;
  detail: string | null;
  delta: number | null;
  subscore: SubscoreCode | null;
}

export interface WhatIfItem extends ReviewPatientRef {
  id: string;
  /** 相關嘅必做項目／醫囑名稱（來自 content 表；冇就 null） */
  label: string | null;
  t: number;
  rule: string;
  facts: Readonly<Record<string, number | string>>;
}

export type GuidelineStatus = 'ON_TIME' | 'LATE' | 'MISSED';

export interface GuidelineItem extends ReviewPatientRef {
  id: string;
  itemId: string;
  label: string;
  status: GuidelineStatus;
  windowSec: number;
  delaySec: number;
  guideline: { title: string; text: string; source: string };
  reviewStatus: string;
}

export interface SafetyReasonItem extends ReviewPatientRef {
  orderId: string;
  t: number;
  orderLabel: string;
  outcome: 'RELEASED' | 'CANCELLED' | 'OPEN';
  concerns: { by: 'PHARMACY' | 'NURSE'; category: string; verdict: string }[];
  insistCount: number;
  aiScore: number | null;
  /** 經守衛、token 已解析嘅 AI 評語；唔合格為 null（UI 改用事實句） */
  aiReason: string | null;
  danger: {
    level: 'LOW' | 'MID' | 'HIGH';
    category: string;
    reason: string | null;
    hit: boolean | null;
    mode: string | null;
  } | null;
  rules: string[];
}

export interface DeathReviewItem extends ReviewPatientRef {
  t: number;
  salvageable: boolean;
  doneBest: boolean;
  processComplete: boolean;
}

export interface ReviewData {
  summary: RunSummary;
  table: Record<SubscoreCode, ReviewEntry[]>;
  timeline: TimelineItem[];
  whatIf: WhatIfItem[];
  guidelines: GuidelineItem[];
  safety: SafetyReasonItem[];
  deaths: DeathReviewItem[];
}

/** 回顧「如果早做 X」會列出嘅扣分規則（只係有可比較事實嘅項目） */
export const WHAT_IF_RULES: readonly string[] = [
  'REQUIRED_ORDER_LATE',
  'REQUIRED_ORDER_MISSED',
  'TIME_TO_CPR',
  'TIME_TO_FIRST_SHOCK',
  'CYCLE_GAP',
  'PRIORITY_LOWER_FIRST',
  'ESCALATION_SKIPPED_LEVEL',
  'CALL_MISSED',
  'CALL_MISSED_JUNIOR',
  'GATE_INSISTED_CONFIRM',
  'GATE_INSISTED_OBJECT',
  'HANDOVER_OMIT_NEEDED',
  'SELF_CARE_MEAL_MISSED',
];

const KIND_ORDER: Readonly<Record<TimelineKind, number>> = {
  EVENT: 0,
  ORDER: 1,
  CALL: 2,
  SCORE: 3,
};

export function buildReview(state: GameState, tables: ReviewTables): ReviewData {
  const refOf = (patientId: string | null): ReviewPatientRef => {
    const patient = patientId ? state.patients[patientId] : undefined;
    return {
      patientId,
      bed: patient?.bed ?? null,
      name: patient?.demographics.name ?? null,
    };
  };
  const entryOf = (e: LedgerEntry): ReviewEntry => ({
    id: e.id,
    t: e.t,
    subscore: e.subscore,
    rule: e.rule,
    delta: e.delta,
    callId: e.callId,
    evidenceRef: e.evidenceRef,
    facts: e.facts,
    ...refOf(e.patientId),
  });
  const summary = summariseRun(state, tables);
  // 完結時入帳嘅項目（漏做等）帶返發生當時嘅時間；回顧一律按時間排，同時間再按入帳次序
  const entries = state.scoreLedger
    .map((e, index) => ({ e, index }))
    .sort((a, b) => a.e.t - b.e.t || a.index - b.index)
    .map(({ e }) => entryOf(e));

  const table = Object.fromEntries(
    summary.subscores.map((s) => [s.id, entries.filter((e) => e.subscore === s.id)]),
  ) as Record<SubscoreCode, ReviewEntry[]>;

  const orderLabel = (orderId: string | null): string | null => {
    const order = orderId ? state.orders[orderId] : undefined;
    const row = order ? tables['order-catalog'].find((r) => r.id === order.catalogId) : undefined;
    return order && row ? composeOrderLabel(row, order) : null;
  };

  const timeline: TimelineItem[] = [
    ...state.actionLog.map((log): TimelineItem => ({
      key: `log:${log.id}`,
      t: log.t,
      kind: log.kind === 'ORDER' ? 'ORDER' : 'EVENT',
      code: log.reasonCode ?? (log.kind === 'ORDER' ? 'ORDER_PLACED' : 'EVENT'),
      label: orderLabel(log.orderId),
      detail: log.resultText,
      delta: null,
      subscore: null,
      ...refOf(log.patientId),
    })),
    ...state.ward.calls.map((call): TimelineItem => ({
      key: `call:${call.id}`,
      t: call.arrivedAt,
      kind: 'CALL',
      code: `${call.direction}:${call.tag}:${call.status}`,
      label: call.callerName || null,
      detail: call.resolution,
      delta: null,
      subscore: null,
      ...refOf(call.patientId),
    })),
    ...entries.map((e): TimelineItem => ({
      key: `score:${e.id}`,
      t: e.t,
      kind: 'SCORE',
      code: e.rule,
      label: null,
      detail: null,
      delta: e.delta,
      subscore: e.subscore,
      patientId: e.patientId,
      bed: e.bed,
      name: e.name,
    })),
  ].sort(
    (a, b) => a.t - b.t || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.key.localeCompare(b.key),
  );

  const whatIf: WhatIfItem[] = entries
    .filter((e) => e.delta < 0 && WHAT_IF_RULES.includes(e.rule))
    .map((e) => ({
      id: e.id,
      label:
        tables['required-actions'].find((r) => r.id === e.facts.itemId)?.label ??
        tables['order-catalog'].find((r) => r.id === e.facts.catalogId)?.label ??
        null,
      t: e.t,
      rule: e.rule,
      facts: e.facts,
      patientId: e.patientId,
      bed: e.bed,
      name: e.name,
    }));

  const guidelines: GuidelineItem[] = entries.flatMap((e) => {
    if (!e.evidenceRef?.startsWith('req:')) return [];
    const row = tables['required-actions'].find((r) => r.id === e.facts.itemId);
    if (!row) return [];
    const status: GuidelineStatus =
      e.rule === 'REQUIRED_ORDER_ON_TIME'
        ? 'ON_TIME'
        : e.rule === 'REQUIRED_ORDER_LATE'
          ? 'LATE'
          : 'MISSED';
    return [
      {
        id: e.id,
        itemId: row.id,
        label: row.label,
        status,
        windowSec: row.windowSec,
        delaySec: Number(e.facts.delaySec ?? 0),
        guideline: row.guideline,
        reviewStatus: row.reviewStatus,
        patientId: e.patientId,
        bed: e.bed,
        name: e.name,
      },
    ];
  });

  const safety: SafetyReasonItem[] = Object.values(state.orders)
    .filter((o) => o.gate !== null)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((order): SafetyReasonItem => {
      const gate = order.gate;
      const pharmacy = gate?.reviews.find((r) => r.by === 'PHARMACY')?.safety ?? null;
      return {
        orderId: order.id,
        t: order.createdAt,
        orderLabel: orderLabel(order.id) ?? order.catalogId,
        outcome:
          order.status === 'CANCELLED'
            ? 'CANCELLED'
            : order.status === 'GATED' || order.status === 'PENDING_PARSE'
              ? 'OPEN'
              : 'RELEASED',
        concerns: (gate?.reviews ?? []).flatMap((r) =>
          r.concerns.map((c) => ({ by: r.by, category: c.category, verdict: r.verdict ?? 'OK' })),
        ),
        insistCount: gate?.insistCount ?? 0,
        aiScore: pharmacy?.score ?? null,
        aiReason: pharmacy
          ? safeReviewText({ rationale: pharmacy.rationale, tokenValues: pharmacy.tokenValues })
          : null,
        danger: gate?.danger
          ? {
              level: gate.danger.level,
              category: gate.danger.category,
              reason: safeReviewText({
                rationale: gate.danger.rationale,
                tokenValues: gate.danger.tokenValues,
              }),
              hit: gate.rolled?.hit ?? null,
              mode: gate.rolled?.mode ?? null,
            }
          : null,
        rules: entries.filter((e) => e.evidenceRef === `gate:${order.id}`).map((e) => e.rule),
        ...refOf(order.patientId),
      };
    })
    .filter((s) => s.concerns.length > 0 || s.aiScore !== null || s.danger !== null);

  const deaths: DeathReviewItem[] = summary.deaths.map((d) => ({
    t: d.t,
    salvageable: d.salvageable,
    doneBest: !d.salvageable,
    processComplete: d.processComplete,
    ...refOf(d.patientId),
  }));

  return { summary, table, timeline, whatIf, guidelines, safety, deaths };
}
