/**
 * 套用 AI 嘅 order.parse 結果（B1）：AI 只係「理解」——意圖、被引用嘅 catalog id、逐字抽取嘅劑量。
 * 任何數值（劑量）必須逐字喺玩家原文出現；catalog／formulary 唔存在嘅 id 一律丟棄。
 * 其餘欄位（例如 AI 自己加嘅 vitals、diagnosis）一律唔讀。
 */
import { z } from 'zod';
import { queueBeatsForOrders } from '../bedside/queue';
import { abnormalOf, type Beat } from '../chat/dialogue';
import { parseMentions } from '../chat/mentions';
import { rejectAiResult } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import type { Patient } from '../case/patient';
import { cancelOrderState, isCancellable, NO_PARAMS } from './orders';
import { placeAndAck, type PlaceInput } from './placement';
import { composeOrderLabel } from './label';
import type { Order } from './orderTypes';

export const ORDER_PARSE_KIND = 'order.parse';

const resultSchema = z.object({
  intent: z.enum(['ORDER', 'QUESTION', 'CHAT', 'CANCEL', 'DELEGATE', 'UNCLEAR']),
  addressee: z
    .object({ kind: z.string().optional(), id: z.string().nullable().optional() })
    .optional(),
  actions: z
    .array(
      z.object({
        catalogId: z.string(),
        executor: z.enum(['NURSE', 'SUBORDINATE', 'PLAYER']).nullable().optional(),
        drug: z
          .object({
            formularyId: z.string().nullable().optional(),
            dose: z.object({ value: z.number(), unit: z.string() }).nullable().optional(),
            route: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      }),
    )
    .default([]),
  cancelTargets: z.array(z.string()).default([]),
});

const localSchema = z.object({
  patientId: z.string(),
  playerText: z.string(),
  submittedAt: z.number().int(),
});

export function numbersIn(text: string): number[] {
  return [...text.normalize('NFKC').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

function sanitizeParams(
  action: z.infer<typeof resultSchema>['actions'][number],
  ctx: EngineContext,
  playerText: string,
): Order['params'] {
  const row = ctx.tables['order-catalog'].find((r) => r.id === action.catalogId);
  const drug = action.drug;
  if (!row?.formularyId || !drug) return NO_PARAMS;
  const formulary = ctx.tables.formulary.find((f) => f.id === row.formularyId);
  if (!formulary || drug.formularyId !== formulary.id) return NO_PARAMS;
  const lowered = playerText.normalize('NFKC').toLowerCase();

  let dose: Order['params']['dose'] = null;
  if (drug.dose) {
    const unit = formulary.units.find((u) => u.toLowerCase() === drug.dose?.unit.toLowerCase());
    const verbatim = numbersIn(playerText).includes(drug.dose.value);
    if (unit && verbatim && drug.dose.value > 0) dose = { value: drug.dose.value, unit };
  }
  const routeText = drug.route?.toLowerCase();
  const route =
    formulary.routes.find(
      (r) => r.toLowerCase() === routeText && lowered.includes(r.toLowerCase()),
    ) ?? null;
  return { drugFormularyId: formulary.id, dose, route };
}

const STATUS_TOKENS = [
  'vital.hr',
  'vital.sbp',
  'vital.dbp',
  'vital.spo2',
  'vital.rr',
  'vital.temp',
  'mews.score',
];

function symptomsOf(patient: Patient, ctx: EngineContext): string[] {
  const template = ctx.tables['case-templates'].find((c) => c.id === patient.hidden.caseTemplateId);
  return [...(template?.symptomsByState[patient.hidden.fsm.state] ?? [])];
}

export function handleOrderParseResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
  ctx: EngineContext,
): Reduction {
  const parsed = resultSchema.safeParse(payload);
  const local = z.object({ local: localSchema }).safeParse(pending.context);
  if (!parsed.success || !local.success) return rejectAiResult(state, pending);

  const { patientId, playerText, submittedAt } = local.data.local;
  const patient = state.patients[patientId];
  const thread = state.chats[patientId];
  if (!patient || !thread) return { state, effects: [] };
  const result = parsed.data;
  const mentioned = parseMentions(playerText, thread.present);

  const rephrase = (reason: 'UNKNOWN_ORDER' | 'UNSUPPORTED') =>
    queueBeatsForOrders(
      state,
      patient,
      [{ type: 'ASK_REPHRASE', speaker: 'NURSE', reason }],
      {},
      mentioned,
      ctx,
    );

  switch (result.intent) {
    case 'ORDER': {
      const accepted = result.actions
        .slice(0, ctx.config.orders.maxActionsPerParse)
        .flatMap((action) => {
          const row = ctx.tables['order-catalog'].find((r) => r.id === action.catalogId);
          return row
            ? [
                {
                  row,
                  params: sanitizeParams(action, ctx, playerText),
                  executor: action.executor ?? null,
                },
              ]
            : [];
        });
      if (accepted.length === 0) return rephrase('UNKNOWN_ORDER');
      const inputs: PlaceInput[] = accepted.map(({ row, params, executor }) => ({
        patientId,
        row,
        params,
        source: 'AI_PARSED',
        preferredExecutor: executor,
        submittedAt,
      }));
      return placeAndAck(state, patient, inputs, mentioned, ctx);
    }

    case 'CANCEL': {
      let next = state;
      const labels: string[] = [];
      for (const id of result.cancelTargets) {
        const order = next.orders[id];
        if (order?.patientId !== patientId) continue;
        const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
        if (!isCancellable(order, row)) continue;
        next = cancelOrderState(next, order, 'CANCELLED_BY_PLAYER');
        labels.push(composeOrderLabel(row, order));
      }
      if (labels.length === 0) return rephrase('UNKNOWN_ORDER');
      const tokens: Record<string, string> = {};
      const beats: Beat[] = labels.map((label, index) => {
        const token = `order.${String(index + 1)}.label`;
        tokens[token] = label;
        return { type: 'ORDER_CANCELLED', speaker: 'NURSE', labelToken: token };
      });
      return queueBeatsForOrders(next, patient, beats, tokens, mentioned, ctx);
    }

    case 'QUESTION':
    case 'CHAT': {
      const aiPatient = result.addressee?.kind === 'patient';
      const toPatient = thread.present.some(
        (p) => p.kind === 'PATIENT' && mentioned.includes(p.id),
      );
      const toNurse = thread.present.some((p) => p.kind === 'NURSE' && mentioned.includes(p.id));
      const beats: Beat[] = [];
      if (toPatient || (!toNurse && aiPatient)) {
        beats.push({
          type: 'PATIENT_SPEAKS',
          speaker: 'PATIENT',
          symptoms: symptomsOf(patient, ctx),
        });
      }
      if (toNurse || beats.length === 0) {
        beats.push(
          result.intent === 'QUESTION'
            ? {
                type: 'REPORT_STATUS',
                speaker: 'NURSE',
                tokens: STATUS_TOKENS,
                abnormal: abnormalOf(patient, ctx.tables),
              }
            : { type: 'ACK_CHAT', speaker: 'NURSE' },
        );
      }
      return queueBeatsForOrders(state, patient, beats, {}, mentioned, ctx);
    }

    case 'DELEGATE':
      return rephrase('UNSUPPORTED');

    case 'UNCLEAR':
      return rephrase('UNKNOWN_ORDER');
  }
}
