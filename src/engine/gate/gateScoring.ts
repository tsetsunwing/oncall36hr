/**
 * 把關計分（spec §15、§17「安全」分項）：全部經唯一 ledger 嘅 T22 規則。
 * - 玩家聽從關注而取消 order → 「聽從關注」
 * - 把關者提出關注後仍然放行 → 「堅持下單」（OBJECT／CONFIRM 兩級）
 * - 藥房 AI 安全評分按 T22b 分級（只喺 order 真正放行時入帳）
 * - 後果事件實際發生 → 按 AI 評嘅危險度入帳
 */
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import type { Order } from '../orders/orderTypes';
import { applyRule } from '../score/scoring';
import type { GateRecord } from './gateTypes';

const evidenceOf = (order: Order) => `gate:${order.id}`;

function flaggedOf(gate: GateRecord) {
  return gate.reviews.filter((r) => r.verdict !== null && r.verdict !== 'OK');
}

export function scoreObjectionHeeded(state: GameState, order: Order, ctx: EngineContext) {
  const gate = order.gate;
  if (order.status !== 'GATED' || !gate) return state;
  if (gate.phase !== 'DECISION' && gate.phase !== 'RECONFIRM') return state;
  return applyRule(state, 'GATE_OBJECTION_HEEDED', ctx, {
    patientId: order.patientId,
    evidence: evidenceOf(order),
    facts: { catalogId: order.catalogId, insistCount: gate.insistCount },
  });
}

export function scoreRelease(
  state: GameState,
  order: Order,
  gate: GateRecord,
  ctx: EngineContext,
): GameState {
  let next = state;
  const flagged = flaggedOf(gate);
  if (gate.insistCount > 0 && flagged.length > 0) {
    const objected = flagged.some((r) => r.verdict === 'OBJECT');
    next = applyRule(next, objected ? 'GATE_INSISTED_OBJECT' : 'GATE_INSISTED_CONFIRM', ctx, {
      patientId: order.patientId,
      evidence: evidenceOf(order),
      facts: { catalogId: order.catalogId, insistCount: gate.insistCount },
    });
  }
  const safety = gate.reviews.find((r) => r.by === 'PHARMACY')?.safety;
  const model = ctx.tables['scoring-model'][0];
  if (safety && model) {
    const rule =
      safety.score >= model.safetyScore.goodMin
        ? 'PHARMACY_SAFETY_GOOD'
        : safety.score <= model.safetyScore.poorMax
          ? 'PHARMACY_SAFETY_POOR'
          : 'PHARMACY_SAFETY_FAIR';
    next = applyRule(next, rule, ctx, {
      patientId: order.patientId,
      evidence: evidenceOf(order),
      facts: { catalogId: order.catalogId, aiScore: safety.score },
    });
  }
  return next;
}

export function scoreConsequence(
  state: GameState,
  order: Order,
  level: 'LOW' | 'MID' | 'HIGH',
  category: string,
  ctx: EngineContext,
): GameState {
  return applyRule(state, `GATE_CONSEQUENCE_${level}`, ctx, {
    patientId: order.patientId,
    evidence: evidenceOf(order),
    facts: { catalogId: order.catalogId, category, level },
  });
}
