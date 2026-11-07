/**
 * 把關（spec §13、§15）：藥房同護士審視 order，玩家可取消或堅持。
 * AI 只負責「理解」：提出關注（category＋措辭）同評危險度 LOW／MID／HIGH；
 * 後果有冇發生、幾時發生、效果係咩，全部由 engine 用 consequence RNG stream 同 T11 決定。
 * 擲骰喺玩家堅持到位嗰刻就抽好（唔受 AI 回覆次序影響），所以同 seed 可重現。
 */
import { z } from 'zod';
import { rngFloat } from '../core/rng';
import { appendLine, PHARMACY_SPEAKER_ID, queueDialogue, type Beat } from '../chat/dialogue';
import { extractTokens, leaksDiagnosis, validateTemplate } from '../chat/tokens';
import { rejectAiResult } from '../core/ai';
import { enqueue } from '../core/eventQueue';
import type { JsonValue } from '../core/eventQueue';
import type { Effect, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import { CONCERN_CATEGORIES, type ConsequenceRow, type OrderCatalogRow } from '../case/tables';
import { logEvent, updateOrderLog } from '../log/log';
import { ackBeatsFor } from '../orders/ack';
import { scheduleCompletion } from '../orders/orders';
import type { Order } from '../orders/orderTypes';
import {
  GATE_DANGER_KIND,
  GATE_NURSE_KIND,
  GATE_PHARMACY_KIND,
  GATE_TOKENS,
  gateTokens,
  requestDanger,
} from './gateRequest';
import { scoreOrderCommitted } from '../score/requiredOrders';
import { scoreConsequence, scoreRelease } from './gateScoring';
import { EMPTY_REVIEW_TEXT, guardReviewText } from './reviewText';
import type { GateRecord, GateReview, GateRole } from './gateTypes';

export const CONSEQUENCE_ONSET_EVENT_KIND = 'CONSEQUENCE_ONSET';
export const GATE_ADVERSE_EVENT_CODE = 'ADVERSE_EVENT';

function notice(state: GameState, kind: 'INSIST_NOT_AVAILABLE' | 'ORDER_UNKNOWN'): Reduction {
  return { state, effects: [{ type: 'NOTICE', kind, tone: 'warn' }] };
}

function catalogRow(ctx: EngineContext, order: Order): OrderCatalogRow | undefined {
  return ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
}

function setOrder(state: GameState, order: Order): GameState {
  return { ...state, orders: { ...state.orders, [order.id]: order } };
}

const reviewResultSchema = z.object({
  verdict: z.enum(['OK', 'CONFIRM', 'OBJECT']),
  concerns: z
    .array(z.object({ category: z.enum(CONCERN_CATEGORIES), line: z.string() }))
    .default([]),
  safety: z
    .object({ score: z.number().int().min(0).max(10), rationale: z.string() })
    .nullable()
    .optional(),
});

const reviewLocalSchema = z.object({
  orderId: z.string(),
  patientId: z.string(),
  role: z.enum(['PHARMACY', 'NURSE']),
  nurseId: z.string().nullable(),
  allowedTokens: z.array(z.string()),
  frozenTokens: z.record(z.string(), z.string()),
  denyTerms: z.array(z.string()),
});

const dangerResultSchema = z.object({
  danger: z.enum(['LOW', 'MID', 'HIGH']),
  category: z.enum(CONCERN_CATEGORIES),
  rationale: z.string().default(''),
});

const dangerLocalSchema = z.object({ orderId: z.string(), patientId: z.string() });

/** 放行：order 開始執行（完成時間由放行時刻起計），護士確認 */
function releaseOrder(
  state: GameState,
  order: Order,
  ctx: EngineContext,
  gate: GateRecord,
): Reduction {
  const now = state.clock.t;
  const duration = Math.max(0, order.completesAt - order.startsAt);
  const released: Order = {
    ...order,
    status: 'RUNNING',
    startsAt: now,
    completesAt: now + duration,
    gate: { ...gate, phase: 'RELEASED' },
  };
  let next = scheduleCompletion(setOrder(state, released), released);
  next = updateOrderLog(next, order.id, { reasonCode: null });
  next = scoreRelease(next, released, gate, ctx);
  next = scoreOrderCommitted(next, released, ctx);

  const patient = next.patients[order.patientId];
  const effects: Effect[] = [];
  if (patient) {
    const { beats, tokens } = ackBeatsFor([released], ctx);
    const queued = queueDialogue(
      next,
      {
        patientId: patient.id,
        beats,
        tokens: { ...gateTokens(patient, released, catalogRowOrThrow(ctx, order), ctx), ...tokens },
        addressed: [],
      },
      ctx,
    );
    if (queued) {
      next = queued.state;
      effects.push(queued.effect);
    }
  }
  return { state: next, effects };
}

function catalogRowOrThrow(ctx: EngineContext, order: Order): OrderCatalogRow {
  const row = catalogRow(ctx, order);
  if (!row) throw new Error(`Unknown catalog row for order ${order.id}`);
  return row;
}

function lineFor(role: GateRole, nurseId: string | null) {
  return role === 'PHARMACY'
    ? ({ kind: 'PHARMACY', id: PHARMACY_SPEAKER_ID } as const)
    : ({ kind: 'NURSE', id: nurseId ?? '' } as const);
}

function applyReview(
  state: GameState,
  order: Order,
  gate: GateRecord,
  pending: PendingAiRequest,
  ctx: EngineContext,
  review: z.infer<typeof reviewResultSchema>,
  local: z.infer<typeof reviewLocalSchema>,
): Reduction {
  const concerns =
    review.verdict === 'OK' ? [] : review.concerns.slice(0, ctx.config.gate.maxConcerns);
  if (review.verdict !== 'OK' && concerns.length === 0) return rejectAiResult(state, pending);

  const allowed = new Set(local.allowedTokens);
  const built: GateReview['concerns'] = [];
  for (const concern of concerns) {
    if (validateTemplate(concern.line, allowed, ctx.config.chat.maxLineChars) !== null) {
      return rejectAiResult(state, pending);
    }
    if (leaksDiagnosis(concern.line, local.denyTerms)) return rejectAiResult(state, pending);
    const tokenValues: Record<string, string> = {};
    for (const token of extractTokens(concern.line)) {
      const value = local.frozenTokens[token];
      if (value === undefined) return rejectAiResult(state, pending);
      tokenValues[token] = value;
    }
    built.push({ category: concern.category, line: concern.line, tokenValues });
  }

  let next = state;
  for (const concern of built) {
    next = appendLine(next, {
      t: state.clock.t,
      patientId: order.patientId,
      speaker: lineFor(local.role, local.nurseId),
      template: concern.line,
      tokenValues: concern.tokenValues,
      orderId: order.id,
      source: local.role === 'PHARMACY' ? 'PHONE' : 'BEDSIDE',
    });
  }

  const reviews = gate.reviews.map((r) =>
    r.reqId === pending.reqId
      ? {
          ...r,
          status: 'DONE' as const,
          verdict: review.verdict,
          concerns: built,
          safety:
            local.role === 'PHARMACY' && review.safety
              ? {
                  score: review.safety.score,
                  ...guardReviewText(
                    review.safety.rationale,
                    allowed,
                    local.frozenTokens,
                    local.denyTerms,
                    ctx.config.chat.maxLineChars * 2,
                  ),
                }
              : null,
        }
      : r,
  );
  let updated: GateRecord = { ...gate, reviews };
  if (reviews.some((r) => r.status === 'PENDING')) {
    return { state: setOrder(next, { ...order, gate: updated }), effects: [] };
  }

  const flagged = reviews.filter((r) => r.verdict !== null && r.verdict !== 'OK');
  if (flagged.length === 0) return releaseOrder(next, order, ctx, updated);

  const required = Math.max(
    ...flagged.map((r) =>
      r.verdict === 'OBJECT'
        ? ctx.config.gate.insistRequired.OBJECT
        : ctx.config.gate.insistRequired.CONFIRM,
    ),
  );
  updated = { ...updated, phase: 'DECISION', required };
  return { state: setOrder(next, { ...order, gate: updated }), effects: [] };
}

function handleReviewResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const parsed = reviewResultSchema.safeParse(payload);
  const local = z.object({ local: reviewLocalSchema }).safeParse(pending.context);
  if (!parsed.success || !local.success) return rejectAiResult(state, pending);
  const order = state.orders[local.data.local.orderId];
  if (order?.status !== 'GATED' || order.gate?.phase !== 'REVIEW') return { state, effects: [] };
  if (!order.gate.reviews.some((r) => r.reqId === pending.reqId && r.status === 'PENDING')) {
    return { state, effects: [] };
  }
  return applyReview(state, order, order.gate, pending, ctx, parsed.data, local.data.local);
}

function consequenceRow(ctx: EngineContext, category: string): ConsequenceRow | undefined {
  return ctx.tables.consequences.find((c) => c.id === category);
}

function applyConsequenceEffect(state: GameState, order: Order, ctx: EngineContext): GameState {
  const danger = order.gate?.danger;
  const patient = state.patients[order.patientId];
  if (!danger || !patient) return state;
  const effect = consequenceRow(ctx, danger.category)?.levels[danger.level].effect;
  if (!effect) return state;
  const now = state.clock.t;
  const flags = [...new Set([...patient.hidden.fsm.flags, ...effect.setsFlags])];
  const next: GameState = {
    ...state,
    patients: {
      ...state.patients,
      [patient.id]: {
        ...patient,
        hidden: {
          ...patient.hidden,
          fsm: { ...patient.hidden.fsm, flags },
          activeEffects: [
            ...patient.hidden.activeEffects,
            {
              id: `ce:${order.id}`,
              orderId: order.id,
              startsAt: now + effect.delaySec,
              delta: effect.delta,
              rampSec: effect.rampSec,
              durationSec: effect.durationSec,
            },
          ],
        },
      },
    },
  };
  const scored = scoreConsequence(next, order, danger.level, danger.category, ctx);
  return logEvent(scored, { patientId: patient.id, reasonCode: GATE_ADVERSE_EVENT_CODE });
}

function handleDangerResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const parsed = dangerResultSchema.safeParse(payload);
  const local = z.object({ local: dangerLocalSchema }).safeParse(pending.context);
  if (!parsed.success || !local.success) return rejectAiResult(state, pending);
  const order = state.orders[local.data.local.orderId];
  const gate = order?.gate;
  if (order?.status !== 'GATED' || gate?.phase !== 'RATING' || !gate.roll) {
    return { state, effects: [] };
  }

  const { danger, category, rationale } = parsed.data;
  const patient = state.patients[order.patientId];
  const row = catalogRow(ctx, order);
  const caseTemplate = patient
    ? ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId)
    : undefined;
  const dangerText =
    patient && row
      ? guardReviewText(
          rationale,
          new Set(GATE_TOKENS),
          gateTokens(patient, order, row, ctx),
          caseTemplate?.diagnosisTerms ?? [],
          ctx.config.chat.maxLineChars * 2,
        )
      : EMPTY_REVIEW_TEXT;
  const level = consequenceRow(ctx, category)?.levels[danger];
  const hit = level ? gate.roll.value < level.p : false;
  const mode = level?.mode ?? 'REVIEW_ONLY';
  let delaySec: number | null = null;
  if (level && hit && mode === 'DELAYED') {
    const min = level.delayMinSec ?? 0;
    const max = Math.max(min, level.delayMaxSec ?? min);
    delaySec = min + Math.floor(gate.roll.delayValue * (max - min + 1));
  }
  const rated: GateRecord = {
    ...gate,
    danger: { level: danger, category, ...dangerText },
    rolled: { hit, mode, p: level?.p ?? 0, delaySec },
  };
  const withDanger: Order = { ...order, gate: rated };
  const released = releaseOrder(setOrder(state, withDanger), withDanger, ctx, rated);
  let next = released.state;
  const releasedOrder = next.orders[order.id] ?? withDanger;

  if (hit && mode === 'IMMEDIATE') {
    next = applyConsequenceEffect(next, releasedOrder, ctx);
  } else if (hit && mode === 'DELAYED' && delaySec !== null) {
    next = {
      ...next,
      scheduler: enqueue(next.scheduler, {
        time: next.clock.t + delaySec,
        kind: CONSEQUENCE_ONSET_EVENT_KIND,
        payload: { orderId: order.id },
      }),
    };
  }
  return { state: next, effects: released.effects };
}

/** 玩家喺把關決定點按「堅持」 */
function insistOrder(state: GameState, orderId: string, ctx: EngineContext): Reduction {
  const order = state.orders[orderId];
  if (!order) return notice(state, 'ORDER_UNKNOWN');
  const gate = order.gate;
  if (
    order.status !== 'GATED' ||
    !gate ||
    (gate.phase !== 'DECISION' && gate.phase !== 'RECONFIRM')
  ) {
    return notice(state, 'INSIST_NOT_AVAILABLE');
  }
  const row = catalogRow(ctx, order);
  const patient = state.patients[order.patientId];
  if (!row || !patient) return notice(state, 'ORDER_UNKNOWN');

  const count = gate.insistCount + 1;
  if (count < gate.required) {
    const flagged = gate.reviews.filter((r) => r.verdict !== null && r.verdict !== 'OK');
    const beats: Beat[] = flagged.map((r) => ({
      type: 'GATE_RECONFIRM',
      speaker: r.by,
      labelToken: 'order.label',
    }));
    const updated: GateRecord = { ...gate, insistCount: count, phase: 'RECONFIRM' };
    const next = setOrder(state, { ...order, gate: updated });
    const queued = queueDialogue(
      next,
      {
        patientId: patient.id,
        beats,
        tokens: gateTokens(patient, order, row, ctx),
        addressed: [],
      },
      ctx,
    );
    return queued
      ? { state: queued.state, effects: [queued.effect] }
      : { state: next, effects: [] };
  }

  const first = rngFloat(state.rng, 'consequence');
  const second = rngFloat(first.rng, 'consequence');
  const rolled: GateRecord = {
    ...gate,
    insistCount: count,
    phase: 'RATING',
    roll: { value: first.value, delayValue: second.value },
  };
  const withRoll = setOrder({ ...state, rng: second.rng }, { ...order, gate: rolled });
  const requested = requestDanger(withRoll, { ...order, gate: rolled }, row, ctx);
  return requested
    ? { state: requested.state, effects: [requested.effect] }
    : { state: withRoll, effects: [] };
}

export const gateModule: EngineModule = {
  name: 'gate',

  handleIntent(state, intent, ctx) {
    if (intent.type !== 'INSIST_ORDER') return undefined;
    if (state.paused) return notice(state, 'INSIST_NOT_AVAILABLE');
    return insistOrder(state, intent.orderId, ctx);
  },

  handleScheduled(state, event, ctx) {
    if (event.kind !== CONSEQUENCE_ONSET_EVENT_KIND) return undefined;
    const payload = z.object({ orderId: z.string() }).safeParse(event.payload);
    const order = payload.success ? state.orders[payload.data.orderId] : undefined;
    if (!order) return { state, effects: [] };
    return { state: applyConsequenceEffect(state, order, ctx), effects: [] };
  },

  handleAiResult(state, _reqId, payload, ctx, pending) {
    if (!pending) return undefined;
    if (pending.kind === GATE_PHARMACY_KIND || pending.kind === GATE_NURSE_KIND) {
      return handleReviewResult(state, pending, payload, ctx);
    }
    if (pending.kind === GATE_DANGER_KIND) return handleDangerResult(state, pending, payload, ctx);
    return undefined;
  },
};
