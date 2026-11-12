/**
 * 治療「藥物」彈窗：藥名對到藥典就落原有目錄醫囑。
 * 否則劑量與途徑落在類別表內就改狀態機基線；不合就只向醫囑 AI 要一個效果類別 id。
 * 畫面上的數字只來自狀態機。模型的自由文字不寫進生命表徵。
 */
import { z } from 'zod';
import {
  UNLISTED_DRUG_CATALOG_ID,
  categoryPreset,
  getDrugEffectTables,
  normToken,
  resolveDrugPreset,
  type VitalPreset,
} from '@/content/drugEffects';
import { parseMentions } from '../chat/mentions';
import { rejectAiResult, requestAi } from '../core/ai';
import type { JsonValue } from '../core/eventQueue';
import type { Reduction } from '../core/events';
import type { EngineContext } from '../core/module';
import type { GameState, PendingAiRequest } from '../core/state';
import type { Patient } from '../case/patient';
import type { OrderCatalogRow } from '../case/tables';
import { appendLine } from '../chat/dialogue';
import { placeAndAck, type PlaceInput } from './placement';
import type { Order } from './orderTypes';

export const ORDER_EFFECT_KIND = 'order.effect';
export { UNLISTED_DRUG_CATALOG_ID };

const effectPayloadSchema = z
  .object({
    effectCategory: z.string(),
  })
  .strict();

const effectLocalSchema = z
  .object({
    orderId: z.string(),
    patientId: z.string(),
  })
  .strict();

export interface TreatmentParams {
  drugFormularyId: string | null;
  dose: { value: number; unit: string } | null;
  route: string | null;
  frequency?: string;
  prnReason?: string;
  prnCondition?: {
    metric: 'PAIN' | 'TEMPERATURE' | 'AGITATION' | 'NAUSEA';
    comparison: '>' | '>=' | '<' | '<=' | '=';
    threshold: number;
  };
  times?: number;
  rate?: { value: number; unit: string };
  concentration?: string;
  diluent?: string;
  volumeMl?: number;
  infuseOverMinutes?: number;
  treatmentDrugId?: string;
}

function storedParams(
  params: TreatmentParams,
  formularyId: string | null,
  drugName: string | null,
): Order['params'] {
  return {
    drugFormularyId: formularyId,
    dose: params.dose,
    route: params.route,
    ...(params.frequency ? { frequency: params.frequency } : {}),
    ...(params.prnReason ? { prnReason: params.prnReason } : {}),
    ...(params.prnCondition ? { prnCondition: params.prnCondition } : {}),
    ...(params.times ? { times: params.times } : {}),
    ...(params.rate ? { rate: params.rate } : {}),
    ...(params.concentration ? { concentration: params.concentration } : {}),
    ...(params.diluent ? { diluent: params.diluent } : {}),
    ...(params.volumeMl ? { volumeMl: params.volumeMl } : {}),
    ...(params.infuseOverMinutes ? { infuseOverMinutes: params.infuseOverMinutes } : {}),
    ...(drugName ? { drugName } : {}),
  };
}

function catalogByName(name: string, ctx: EngineContext): OrderCatalogRow | undefined {
  const key = normToken(name);
  const formulary =
    ctx.tables.formulary.find((row) => normToken(row.label) === key) ??
    ctx.tables.formulary.find((row) => row.aliases.some((alias) => normToken(alias) === key));
  if (formulary) {
    const linked = ctx.tables['order-catalog'].find((row) => row.id === formulary.catalogId);
    if (linked) return linked;
  }
  return (
    ctx.tables['order-catalog'].find((row) => normToken(row.label) === key) ??
    ctx.tables['order-catalog'].find((row) => row.aliases.some((alias) => normToken(alias) === key))
  );
}

export function placeTreatmentDrug(
  state: GameState,
  patient: Patient,
  text: string,
  params: TreatmentParams,
  ctx: EngineContext,
): Reduction {
  const thread = state.chats[patient.id];
  const drugId = params.treatmentDrugId;
  const drug = drugId ? ctx.tables['treatment-drugs'].find((row) => row.id === drugId) : undefined;
  const unlisted = ctx.tables['order-catalog'].find((row) => row.id === UNLISTED_DRUG_CATALOG_ID);
  if (!thread || !drug || !unlisted || params.drugFormularyId !== null) {
    return { state, effects: [{ type: 'NOTICE', kind: 'ORDER_INVALID', tone: 'warn' }] };
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
  const addressed = parseMentions(text, thread.present);
  const matched = catalogByName(drug.name, ctx);

  let row = unlisted;
  let orderParams = storedParams(params, null, drug.name);
  let effectPreset: VitalPreset | undefined;
  let askEffect = false;
  if (matched && matched.id !== UNLISTED_DRUG_CATALOG_ID) {
    row = matched;
    orderParams = storedParams(params, matched.formularyId ?? null, null);
  } else {
    const decision = resolveDrugPreset(drug, params.dose, params.route, getDrugEffectTables());
    if (decision.kind === 'preset') effectPreset = decision.preset;
    else askEffect = true;
  }

  const input: PlaceInput = {
    patientId: patient.id,
    row,
    params: orderParams,
    source: 'QUICKWORD',
    preferredExecutor: null,
    submittedAt,
    ...(effectPreset ? { effectPreset } : {}),
  };
  const placed = placeAndAck(withPlayerLine, patient, [input], addressed, ctx);
  const order = placed.orders[0];
  if (!askEffect || !order) return placed;

  const tables = getDrugEffectTables();
  const requested = requestAi(placed.state, ORDER_EFFECT_KIND, {
    prompt: {
      text,
      drugName: drug.name,
      dose: params.dose,
      route: params.route,
      classes: [...drug.classes],
      categories: tables.categories.map((item) => ({ id: item.id, label: item.label })),
    },
    local: { orderId: order.id, patientId: patient.id },
  });
  return { state: requested.state, effects: [...placed.effects, requested.effect] };
}

/** 模型只可交回效果類別 id。對不上就不套用，也不從文字拆數字。 */
export function applyTreatmentEffectResult(
  state: GameState,
  pending: PendingAiRequest,
  payload: JsonValue,
): Reduction {
  const local = effectLocalSchema.safeParse(
    typeof pending.context === 'object' && pending.context !== null && 'local' in pending.context
      ? pending.context.local
      : undefined,
  );
  const parsed = effectPayloadSchema.safeParse(payload);
  if (!local.success || !parsed.success) return rejectAiResult(state, pending);
  const preset = categoryPreset(parsed.data.effectCategory, getDrugEffectTables().categories);
  if (!preset) return rejectAiResult(state, pending);
  const order = state.orders[local.data.orderId];
  if (order?.patientId !== local.data.patientId) return { state, effects: [] };
  return {
    state: {
      ...state,
      orders: {
        ...state.orders,
        [order.id]: { ...order, effectPreset: preset },
      },
    },
    effects: [],
  };
}
