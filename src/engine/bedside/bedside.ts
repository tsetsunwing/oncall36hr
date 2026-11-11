/**
 * 床邊模組：床邊對話（設計 B）、玩家落字入口、AI 結果分派。
 * 自由文字先試本地快捷詞（別名只留喺呢條路）；唔中先發 order.parse。
 * 菜單同藥物表用 PLACE_CATALOG，按 catalog id 直接落單，唔解析、唔叫模型認 order。
 * 治療藥表對到藥典或類別範圍時同樣不叫模型。只有超出範圍、沒有類別或途徑不平常，才向 order.effect 要一個效果類別 id。
 */
import { z } from 'zod';
import type { Patient } from '../case/patient';
import type { Present } from '../chat/chatTypes';
import type { OrderCatalogRow } from '../case/tables';
import { appendLine, DIALOGUE_KIND, handleDialogueResult } from '../chat/dialogue';
import { parseMentions } from '../chat/mentions';
import { requestAi } from '../core/ai';
import type { PlayerIntent, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import { handleOrderParseResult, ORDER_PARSE_KIND } from '../orders/orderParse';
import { placeAndAck } from '../orders/placement';
import {
  applyTreatmentEffectResult,
  ORDER_EFFECT_KIND,
  placeTreatmentDrug,
  UNLISTED_DRUG_CATALOG_ID,
} from '../orders/treatmentDrug';
import { DRAIN_CATALOG_ID, normalizeDrainSite } from '../orders/drains';
import { oxygenOrderRejected } from '../orders/oxygen';
import { matchQuickPhrase } from '../orders/quickPhrase';
import { nurseForBed } from '../ward/nurses';

const reject = (
  state: GameState,
  kind:
    | 'CHAT_EMPTY'
    | 'CHAT_TOO_LONG'
    | 'PATIENT_UNKNOWN'
    | 'ORDER_BLOCKED_PAUSED'
    | 'ORDER_UNKNOWN'
    | 'ORDER_INVALID',
): Reduction => ({
  state,
  effects: [{ type: 'NOTICE', kind, tone: 'warn' }],
});

const placedParamsSchema = z
  .object({
    drugFormularyId: z.string().nullable(),
    dose: z
      .object({ value: z.number().positive(), unit: z.string().min(1) })
      .strict()
      .nullable(),
    route: z.string().min(1).nullable(),
    frequency: z.string().min(1).optional(),
    times: z.number().int().min(1).max(3).optional(),
    rate: z
      .object({ value: z.number().positive(), unit: z.string().min(1) })
      .strict()
      .optional(),
    treatmentDrugId: z.string().min(1).optional(),
    summary: z.string().min(1).optional(),
    site: z.string().min(1).max(80).optional(),
  })
  .strict();

function placeCatalog(
  state: GameState,
  intent: Extract<PlayerIntent, { type: 'PLACE_CATALOG' }>,
  ctx: EngineContext,
): Reduction {
  if (state.paused) return reject(state, 'ORDER_BLOCKED_PAUSED');
  const text = intent.text.trim();
  if (text.length === 0) return reject(state, 'CHAT_EMPTY');
  if (text.length > ctx.config.chat.playerTextMaxChars) return reject(state, 'CHAT_TOO_LONG');
  const patient = state.patients[intent.patientId];
  const thread = state.chats[intent.patientId];
  if (!patient || !thread) return reject(state, 'PATIENT_UNKNOWN');
  const row = ctx.tables['order-catalog'].find((item) => item.id === intent.catalogId);
  if (!row) return reject(state, 'ORDER_UNKNOWN');
  const parsed = placedParamsSchema.safeParse(intent.params);
  if (!parsed.success) return reject(state, 'ORDER_INVALID');
  const params = parsed.data;
  if (params.treatmentDrugId) {
    if (intent.catalogId !== UNLISTED_DRUG_CATALOG_ID || params.drugFormularyId !== null) {
      return reject(state, 'ORDER_INVALID');
    }
    return placeTreatmentDrug(
      state,
      patient,
      text,
      {
        drugFormularyId: params.drugFormularyId,
        dose: params.dose,
        route: params.route,
        ...(params.frequency ? { frequency: params.frequency } : {}),
        ...(params.times ? { times: params.times } : {}),
        ...(params.rate ? { rate: params.rate } : {}),
        ...(params.treatmentDrugId ? { treatmentDrugId: params.treatmentDrugId } : {}),
      },
      ctx,
    );
  }
  if (row.formularyId) {
    if (params.drugFormularyId !== row.formularyId) return reject(state, 'ORDER_INVALID');
  } else if (params.drugFormularyId !== null) {
    return reject(state, 'ORDER_INVALID');
  }
  if (oxygenOrderRejected(row.id, params.dose, params.rate)) return reject(state, 'ORDER_INVALID');
  const drainSite =
    row.id === DRAIN_CATALOG_ID ? (params.site ? normalizeDrainSite(params.site) : null) : null;
  if (row.id === DRAIN_CATALOG_ID && !drainSite) return reject(state, 'ORDER_INVALID');
  const stored = {
    drugFormularyId: params.drugFormularyId,
    dose: params.dose,
    route: params.route,
    ...(params.frequency ? { frequency: params.frequency } : {}),
    ...(params.times ? { times: params.times } : {}),
    ...(params.rate ? { rate: params.rate } : {}),
    ...(drainSite
      ? { site: drainSite, summary: params.summary ?? `Surgical drain ${drainSite}` }
      : params.summary
        ? { summary: params.summary }
        : {}),
  };

  const submittedAt = state.clock.t;
  const withPlayerLine = appendLine(state, {
    t: submittedAt,
    patientId: patient.id,
    speaker: { kind: 'PLAYER', id: 'player' },
    template: text,
    tokenValues: {},
    orderId: null,
  });
  return placeAndAck(
    withPlayerLine,
    patient,
    [
      {
        patientId: patient.id,
        row,
        params: stored,
        source: 'QUICKWORD',
        preferredExecutor: null,
        submittedAt,
      },
    ],
    parseMentions(text, thread.present),
    ctx,
  );
}

/** 抽血籃：一次落多張化驗單。同一批共用同一個抽血時間，但每張報告各自延遲。 */
function placeCatalogBatch(
  state: GameState,
  intent: Extract<PlayerIntent, { type: 'PLACE_CATALOG_BATCH' }>,
  ctx: EngineContext,
): Reduction {
  if (state.paused) return reject(state, 'ORDER_BLOCKED_PAUSED');
  const text = intent.text.trim();
  if (text.length === 0) return reject(state, 'CHAT_EMPTY');
  if (text.length > ctx.config.chat.playerTextMaxChars) return reject(state, 'CHAT_TOO_LONG');
  const patient = state.patients[intent.patientId];
  const thread = state.chats[intent.patientId];
  if (!patient || !thread) return reject(state, 'PATIENT_UNKNOWN');
  if (intent.catalogIds.length === 0) return reject(state, 'ORDER_INVALID');
  const rows: OrderCatalogRow[] = [];
  for (const id of intent.catalogIds) {
    const row = ctx.tables['order-catalog'].find((item) => item.id === id);
    if (!row) return reject(state, 'ORDER_UNKNOWN');
    // 籃只裝檢查。要填劑量、途徑或位置的醫囑逐張落。
    if (row.formularyId || row.id === DRAIN_CATALOG_ID) return reject(state, 'ORDER_INVALID');
    if (rows.some((existing) => existing.id === row.id)) return reject(state, 'ORDER_INVALID');
    rows.push(row);
  }
  const submittedAt = state.clock.t;
  const withPlayerLine = appendLine(state, {
    t: submittedAt,
    patientId: patient.id,
    speaker: { kind: 'PLAYER', id: 'player' },
    template: text,
    tokenValues: {},
    orderId: null,
  });
  return placeAndAck(
    withPlayerLine,
    patient,
    rows.map((row) => ({
      patientId: patient.id,
      row,
      params: { drugFormularyId: null, dose: null, route: null },
      source: 'QUICKWORD',
      preferredExecutor: null,
      submittedAt,
    })),
    parseMentions(text, thread.present),
    ctx,
    { combineAck: true },
  );
}

export const MENTION_KEYS = { NURSE: ['RN', '護士'], PATIENT: ['病人'] } as const;

export function buildPresent(state: GameState, patient: Patient, ctx: EngineContext): Present[] {
  const present: Present[] = [];
  const nurse = nurseForBed(state, ctx, patient.bed);
  if (nurse) {
    present.push({
      id: `nurse:${nurse.id}`,
      kind: 'NURSE',
      name: nurse.name,
      tone: nurse.tone,
      mentionKeys: [nurse.name, ...MENTION_KEYS.NURSE],
    });
  }
  present.push({
    id: `patient:${patient.id}`,
    kind: 'PATIENT',
    name: patient.demographics.name,
    tone: null,
    mentionKeys: [patient.demographics.name, ...MENTION_KEYS.PATIENT],
  });
  return present;
}

export const bedsideModule: EngineModule = {
  name: 'bedside',

  init(state, params, ctx) {
    if (params.ward) return state;
    let next = state;
    for (const patient of Object.values(state.patients)) {
      const present = buildPresent(next, patient, ctx);
      next = {
        ...next,
        chats: {
          ...next.chats,
          [patient.id]: {
            patientId: patient.id,
            present,
            lines: [],
            visits: [
              {
                enteredAt: next.clock.t,
                leftAt: null,
                lineCountAtEnter: 0,
                lineCountAtLeave: null,
              },
            ],
          },
        },
      };
      for (const who of present) {
        next = appendLine(next, {
          t: next.clock.t,
          patientId: patient.id,
          speaker: { kind: 'SYSTEM', id: who.id },
          template: 'ARRIVE',
          tokenValues: {},
          orderId: null,
        });
      }
    }
    return next;
  },

  handleIntent(state, intent, ctx) {
    switch (intent.type) {
      case 'ENTER_BED':
      case 'LEAVE_BED': {
        const thread = state.chats[intent.patientId];
        if (!thread) return reject(state, 'PATIENT_UNKNOWN');
        const last = thread.visits.at(-1);
        const inBed = last?.leftAt === null;
        if (intent.type === 'ENTER_BED') {
          if (inBed) return { state, effects: [] };
          const visits = [
            ...thread.visits,
            {
              enteredAt: state.clock.t,
              leftAt: null,
              lineCountAtEnter: thread.lines.length,
              lineCountAtLeave: null,
            },
          ];
          return {
            state: {
              ...state,
              chats: { ...state.chats, [thread.patientId]: { ...thread, visits } },
            },
            effects: [],
          };
        }
        if (!inBed) return { state, effects: [] };
        const visits = [
          ...thread.visits.slice(0, -1),
          { ...last, leftAt: state.clock.t, lineCountAtLeave: thread.lines.length },
        ];
        return {
          state: { ...state, chats: { ...state.chats, [thread.patientId]: { ...thread, visits } } },
          effects: [],
        };
      }

      case 'SUBMIT_CHAT': {
        if (state.paused) return reject(state, 'ORDER_BLOCKED_PAUSED');
        const text = intent.text.trim();
        if (text.length === 0) return reject(state, 'CHAT_EMPTY');
        if (text.length > ctx.config.chat.playerTextMaxChars) return reject(state, 'CHAT_TOO_LONG');
        const patient = state.patients[intent.patientId];
        const thread = state.chats[intent.patientId];
        if (!patient || !thread) return reject(state, 'PATIENT_UNKNOWN');

        const submittedAt = state.clock.t;
        const withPlayerLine = appendLine(state, {
          t: submittedAt,
          patientId: patient.id,
          speaker: { kind: 'PLAYER', id: 'player' },
          template: text,
          tokenValues: {},
          orderId: null,
        });
        const addressed = parseMentions(text, thread.present);

        const local = matchQuickPhrase(text, ctx.tables);
        const row = local && ctx.tables['order-catalog'].find((r) => r.id === local.catalogId);
        if (local && row) {
          return placeAndAck(
            withPlayerLine,
            patient,
            [
              {
                patientId: patient.id,
                row,
                params: local.params,
                source: 'QUICKWORD',
                preferredExecutor: local.executor,
                submittedAt,
              },
            ],
            addressed,
            ctx,
          );
        }

        const context = {
          prompt: {
            text,
            patientId: patient.id,
            speakers: thread.present.map((p) => ({ id: p.id, kind: p.kind, name: p.name })),
            catalog: ctx.tables['order-catalog'].map((r) => ({
              id: r.id,
              type: r.type,
              label: r.label,
              aliases: [...r.aliases],
              formularyId: r.formularyId ?? null,
              executors: [...r.executors],
            })),
            formulary: ctx.tables.formulary.map((f) => ({
              id: f.id,
              label: f.label,
              aliases: [...f.aliases],
              units: [...f.units],
              routes: [...f.routes],
            })),
            openOrders: Object.values(withPlayerLine.orders)
              .filter(
                (o) =>
                  o.patientId === patient.id && (o.status === 'RUNNING' || o.status === 'GATED'),
              )
              .map((o) => ({ id: o.id, catalogId: o.catalogId })),
          },
          local: { patientId: patient.id, playerText: text, submittedAt },
        };
        const queued = requestAi(withPlayerLine, ORDER_PARSE_KIND, context);
        return { state: queued.state, effects: [queued.effect] };
      }

      case 'PLACE_CATALOG':
        return placeCatalog(state, intent, ctx);

      case 'PLACE_CATALOG_BATCH':
        return placeCatalogBatch(state, intent, ctx);

      default:
        return undefined;
    }
  },

  handleAiResult(state, _reqId, payload, ctx, pending) {
    if (!pending) return undefined;
    if (pending.kind === ORDER_PARSE_KIND)
      return handleOrderParseResult(state, pending, payload, ctx);
    if (pending.kind === ORDER_EFFECT_KIND)
      return applyTreatmentEffectResult(state, pending, payload);
    if (pending.kind === DIALOGUE_KIND) return handleDialogueResult(state, pending, payload, ctx);
    return undefined;
  },
};
