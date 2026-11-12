/**
 * Order 生命週期：落單、固定完成時間（S28 A）、取消。
 * 暫停時唔接受新 order，但接受取消（Q76 B、S-6 A）。
 * 由 order-catalog（T4）驅動；完成時套用 flags、凍結結果文字、等護士匯報；
 * 化驗／影像完成後按 T7 排程報告（results 模組）；把關由 gate 模組處理，放行後先排程完成。
 */
import { applyAclsOrder } from '../acls/orders';
import { abnormalOf, patientTokens, queueDialogue, vitalTokens, type Beat } from '../chat/dialogue';
import { extractTokens, renderTemplate } from '../chat/tokens';
import { enqueue, removeWhere } from '../core/eventQueue';
import type { Effect, NoticeKind, Reduction } from '../core/events';
import type { EngineContext, EngineModule } from '../core/module';
import type { GameState } from '../core/state';
import type { OrderCatalogRow } from '../case/tables';
import { scoreObjectionHeeded } from '../gate/gateScoring';
import { updateOrderLog } from '../log/log';
import { modifiersForFlags } from '../case/labs';
import { scheduleResultReport } from '../results/results';
import { attachDrain } from './drains';
import { composeOrderLabel } from './label';
import { CANCELLABLE_STATUSES, type Order } from './orderTypes';
import { startHourOf } from '../shift/timeline';
import { startRegimenBag } from './infusionTiming';
import {
  nextMedicationTime,
  prnEligible,
  type FixedFrequency,
  type IntervalFrequency,
} from './medicationSchedule';
import {
  planAdministration,
  startAdministration,
  recordAdministration,
  cancelPlannedAdministrations,
} from './medicationAdministration';

export const ORDER_COMPLETE_EVENT_KIND = 'ORDER_COMPLETE';
export const FLUID_BAG_END_EVENT_KIND = 'FLUID_BAG_END';
export const PRN_CHECK_EVENT_KIND = 'PRN_CHECK';
export const MEDICATION_DOSE_EVENT_KIND = 'MEDICATION_DOSE';
export const MEDICATION_INFUSION_END_EVENT_KIND = 'MEDICATION_INFUSION_END';
const Q_HOURS = ['Q1H', 'Q2H', 'Q4H', 'Q6H', 'Q8H', 'Q12H', 'Q24H'] as const;
const FIXED_FREQUENCIES = ['Daily', 'BD', 'TDS', 'QID'] as const;
type ScheduledFrequency = IntervalFrequency | FixedFrequency | 'STAT';

function isScheduledMedication(
  order: Order,
  ctx: EngineContext,
): order is Order & { params: Order['params'] & { frequency: ScheduledFrequency } } {
  const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
  const frequency = order.params.frequency;
  return (
    row?.type === 'DRUG' &&
    !row.acls &&
    order.executorKind === 'NURSE' &&
    !order.params.prnReason &&
    !order.params.route?.toLowerCase().startsWith('iv infusion') &&
    (frequency === 'STAT' ||
      Q_HOURS.some((item) => item === frequency) ||
      FIXED_FREQUENCIES.some((item) => item === frequency))
  );
}

function scheduleDose(
  state: GameState,
  order: Order & { params: Order['params'] & { frequency: ScheduledFrequency } },
  from: number,
  ctx: EngineContext,
): GameState {
  const at =
    order.params.frequency === 'STAT'
      ? from
      : nextMedicationTime(
          order.params.frequency,
          order.createdAt,
          from,
          startHourOf(ctx.config, state.mode),
          ctx.config.orders.fixedMedicationHours,
          ctx.config.orders.medicationAnchorHour,
        );
  if (at === null) return state;
  const administrations = planAdministration(
    order.administrations ?? [],
    order.id,
    order.patientId,
    at,
  );
  return {
    ...state,
    orders: { ...state.orders, [order.id]: { ...order, administrations } },
    scheduler: enqueue(state.scheduler, {
      time: at,
      kind: MEDICATION_DOSE_EVENT_KIND,
      payload: { orderId: order.id, scheduledAt: at },
    }),
  };
}

function reject(state: GameState, kind: NoticeKind): Reduction {
  return { state, effects: [{ type: 'NOTICE', kind, tone: 'warn' }] };
}

function isOrderCompletePayload(payload: unknown): payload is { orderId: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'orderId' in payload &&
    typeof payload.orderId === 'string'
  );
}

export const NO_PARAMS: Order['params'] = { drugFormularyId: null, dose: null, route: null };
function startNextFluidBag(state: GameState, order: Order): GameState {
  const regimen = order.params.fluidRegimen;
  if (!regimen) return state;
  const bags = order.fluidBags ?? [];
  const firstStart = bags[0]?.startAt ?? state.clock.t;
  const bag = startRegimenBag(
    {
      solutions: regimen.solutions,
      volumeMl: regimen.volumeMl,
      durationSeconds: regimen.durationSeconds,
      maxBags: regimen.maxBags ?? null,
      stopAt: regimen.maxDurationSeconds ? firstStart + regimen.maxDurationSeconds : null,
    },
    bags.length,
    state.clock.t,
  );
  if (!bag)
    return { ...state, orders: { ...state.orders, [order.id]: { ...order, status: 'DONE' } } };
  const item: NonNullable<Order['fluidBags']>[number] = {
    index: bag.index,
    solution: bag.solution,
    ...(regimen.additive ? { additive: regimen.additive } : {}),
    volumeMl: bag.volumeMl,
    startAt: bag.startAt,
    scheduledEndAt: bag.endAt,
    endedAt: null,
    status: 'INFUSING',
  };
  return {
    ...state,
    orders: { ...state.orders, [order.id]: { ...order, fluidBags: [...bags, item] } },
    scheduler: enqueue(state.scheduler, {
      time: bag.endAt,
      kind: FLUID_BAG_END_EVENT_KIND,
      payload: { orderId: order.id, index: bag.index },
    }),
  };
}

export function scheduleCompletion(state: GameState, order: Order, ctx: EngineContext): GameState {
  if (order.catalogId === 'fluid.maintenance')
    return order.params.fluidRegimen ? startNextFluidBag(state, order) : state;
  if (order.params.prnReason) {
    // Legacy or incomplete PRN orders must never fall through to ordinary completion.
    const active = { ...order, administrations: order.administrations ?? [] };
    return {
      ...state,
      orders: { ...state.orders, [order.id]: active },
      scheduler: enqueue(state.scheduler, {
        time: state.clock.t,
        priority: 20,
        kind: PRN_CHECK_EVENT_KIND,
        payload: { orderId: order.id },
      }),
    };
  }
  if (isScheduledMedication(order, ctx)) return scheduleDose(state, order, state.clock.t, ctx);
  return {
    ...state,
    scheduler: enqueue(state.scheduler, {
      time: order.completesAt,
      kind: ORDER_COMPLETE_EVENT_KIND,
      payload: { orderId: order.id },
    }),
  };
}

/** 登記 order（分配 id 計數）。只有 RUNNING 嘅 order 即時排程完成；GATED 等放行 */
export function registerOrder(state: GameState, order: Order, ctx: EngineContext): GameState {
  const registered: GameState = {
    ...state,
    orders: { ...state.orders, [order.id]: order },
    counters: { ...state.counters, order: state.counters.order + 1 },
  };
  return order.status === 'RUNNING' ? scheduleCompletion(registered, order, ctx) : registered;
}

export function isCancellable(order: Order, row: OrderCatalogRow | undefined): boolean {
  if (!CANCELLABLE_STATUSES.includes(order.status)) return false;
  if (order.status === 'GATED' || !row) return true;
  return (row.cancelWhile as readonly string[]).includes(order.status);
}

/**
 * 取消 order。冇開始過（等把關）嘅 order 冇任何已投入部分；
 * 已開始嘅按 catalog `sunkEffectRule` 處理（見 vitals.sunkFraction）。
 */
export function cancelOrderState(state: GameState, order: Order, reasonCode: string): GameState {
  const now = state.clock.t;
  const neverStarted = order.status === 'GATED' || order.status === 'PENDING_PARSE';
  const cancelled: GameState = {
    ...state,
    orders: {
      ...state.orders,
      [order.id]: {
        ...order,
        status: 'CANCELLED',
        cancelledAt: now,
        ...(order.administrations
          ? { administrations: cancelPlannedAdministrations(order.administrations, order.id, now) }
          : {}),
        ...(order.fluidBags
          ? {
              fluidBags: order.fluidBags.map((bag) =>
                bag.status === 'INFUSING'
                  ? { ...bag, status: 'STOPPED' as const, endedAt: now }
                  : bag,
              ),
            }
          : {}),
        ...(neverStarted ? { startsAt: now, completesAt: now } : {}),
      },
    },
    scheduler: removeWhere(
      state.scheduler,
      (e) =>
        (e.kind === FLUID_BAG_END_EVENT_KIND ||
          e.kind === PRN_CHECK_EVENT_KIND ||
          e.kind === ORDER_COMPLETE_EVENT_KIND ||
          e.kind === MEDICATION_DOSE_EVENT_KIND ||
          e.kind === MEDICATION_INFUSION_END_EVENT_KIND) &&
        isOrderCompletePayload(e.payload) &&
        e.payload.orderId === order.id,
    ),
  };
  return updateOrderLog(cancelled, order.id, { reasonCode });
}

export function completeOrder(state: GameState, order: Order, ctx: EngineContext): Reduction {
  const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
  const existingPatient = state.patients[order.patientId];
  if (
    existingPatient?.demographics.code === 'DNR' &&
    (row?.acls?.action === 'CPR_START' || row?.acls?.action === 'DEFIB')
  ) {
    const failed = {
      ...state,
      orders: { ...state.orders, [order.id]: { ...order, status: 'FAILED' as const } },
    };
    return {
      state: updateOrderLog(failed, order.id, { reasonCode: 'DNR_NO_RESUS' }),
      effects: [{ type: 'NOTICE', kind: 'DNR_NO_RESUS', tone: 'warn' }],
    };
  }
  let next: GameState = {
    ...state,
    orders: { ...state.orders, [order.id]: { ...order, status: 'DONE' } },
  };
  const effects: Effect[] = [];
  const patient = next.patients[order.patientId];
  if (!row || !patient) return { state: next, effects };

  const flags = [...new Set([...patient.hidden.fsm.flags, ...row.setsFlags])];
  const freshFlags = flags.filter((flag) => !patient.hidden.fsm.flags.includes(flag));
  const modifiers = modifiersForFlags(ctx.tables['lab-effects'], freshFlags, state.clock.t);
  const withFlags = attachDrain(
    {
      ...patient,
      hidden: {
        ...patient.hidden,
        fsm: { ...patient.hidden.fsm, flags },
        labModifiers:
          modifiers.length === 0
            ? patient.hidden.labModifiers
            : [...patient.hidden.labModifiers, ...modifiers],
      },
    },
    order,
  );
  next = { ...next, patients: { ...next.patients, [patient.id]: withFlags } };

  const acls = applyAclsOrder(next, order, row, ctx);
  next = acls.state;
  effects.push(...acls.effects);

  if (row.resultId) {
    next = scheduleResultReport(next, order.id, withFlags.hidden.fsm.state, row, ctx);
  }

  if (row.resultTemplate) {
    const tokens = { ...vitalTokens(withFlags, ctx.tables), ...patientTokens(withFlags) };
    next = updateOrderLog(next, order.id, {
      resultText: renderTemplate(row.resultTemplate, tokens),
    });
    const label = composeOrderLabel(row, order);
    const resultTokens = extractTokens(row.resultTemplate);
    const beat: Beat = {
      type: 'REPORT_RESULT',
      speaker: 'NURSE',
      labelToken: 'order.1.label',
      tokens: resultTokens,
      abnormal: abnormalOf(withFlags, ctx.tables),
      preset: row.resultTemplate,
    };
    const queued = queueDialogue(
      next,
      {
        patientId: patient.id,
        beats: [beat],
        tokens: { ...tokens, 'order.1.label': label },
        addressed: [],
        resolvedOrder: { catalogId: row.id, label },
      },
      ctx,
    );
    if (queued) {
      next = queued.state;
      if (queued.effect) effects.push(queued.effect);
    }
  }
  return { state: next, effects };
}

export const ordersModule: EngineModule = {
  name: 'orders',

  handleIntent(state, intent, ctx) {
    if (intent.type === 'PLACE_ORDER') {
      if (state.paused) return reject(state, 'ORDER_BLOCKED_PAUSED');
      const { patientId, catalogId, durationSec } = intent;
      if (
        patientId.length === 0 ||
        catalogId.length === 0 ||
        catalogId === 'fluid.maintenance' ||
        !Number.isInteger(durationSec) ||
        durationSec < 0
      ) {
        return reject(state, 'ORDER_INVALID');
      }
      const id = `o${String(state.counters.order + 1)}`;
      const now = state.clock.t;
      const order: Order = {
        id,
        patientId,
        catalogId,
        createdAt: now,
        startsAt: now,
        completesAt: now + durationSec,
        status: 'RUNNING',
        source: 'MANUAL',
        params: NO_PARAMS,
        executor: null,
        executorKind: null,
        cancelledAt: null,
        resultStatus: null,
        sampledState: null,
        gate: null,
      };
      return { state: registerOrder(state, order, ctx), effects: [] };
    }

    if (intent.type === 'CANCEL_ORDER') {
      const order = state.orders[intent.orderId];
      if (!order) return reject(state, 'ORDER_UNKNOWN');
      const row = ctx.tables['order-catalog'].find((r) => r.id === order.catalogId);
      if (!isCancellable(order, row)) return reject(state, 'ORDER_NOT_CANCELLABLE');
      const heeded = scoreObjectionHeeded(state, order, ctx);
      return { state: cancelOrderState(heeded, order, 'CANCELLED_BY_PLAYER'), effects: [] };
    }
    return undefined;
  },

  handleScheduled(state, event, ctx) {
    if (event.kind === FLUID_BAG_END_EVENT_KIND) {
      if (
        !isOrderCompletePayload(event.payload) ||
        !('index' in event.payload) ||
        typeof event.payload.index !== 'number'
      )
        return { state, effects: [] };
      const index = event.payload.index;
      const order = state.orders[event.payload.orderId];
      if (order?.status !== 'RUNNING' || !order.params.fluidRegimen || !order.fluidBags)
        return { state, effects: [] };
      if (
        state.death?.patientId === order.patientId ||
        !state.patients[order.patientId] ||
        state.patients[order.patientId]?.hidden.fsm.flags.includes('ward.departed')
      )
        return { state: cancelOrderState(state, order, 'PATIENT_DEPARTED'), effects: [] };
      const current = order.fluidBags.find(
        (bag) => bag.index === index && bag.status === 'INFUSING',
      );
      if (!current) return { state, effects: [] };
      const clipped =
        current.scheduledEndAt - current.startAt < order.params.fluidRegimen.durationSeconds;
      const finished = {
        ...order,
        fluidBags: order.fluidBags.map((bag) =>
          bag === current
            ? {
                ...bag,
                status: clipped ? ('STOPPED' as const) : ('COMPLETE' as const),
                endedAt: state.clock.t,
              }
            : bag,
        ),
      };
      return {
        state: startNextFluidBag(
          { ...state, orders: { ...state.orders, [order.id]: finished } },
          finished,
        ),
        effects: [],
      };
    }
    if (event.kind === PRN_CHECK_EVENT_KIND) {
      if (!isOrderCompletePayload(event.payload)) return { state, effects: [] };
      const order = state.orders[event.payload.orderId];
      if (order?.status !== 'RUNNING' || !order.params.prnReason) return { state, effects: [] };
      if (state.death?.patientId === order.patientId)
        return { state: cancelOrderState(state, order, 'PATIENT_DECEASED'), effects: [] };
      const patient = state.patients[order.patientId];
      if (!patient || patient.hidden.fsm.flags.includes('ward.departed'))
        return { state: cancelOrderState(state, order, 'PATIENT_DEPARTED'), effects: [] };
      const interval = /^Q(1|2|4|6|8|12|24)H$/.exec(order.params.frequency ?? '');
      const condition = order.params.prnCondition;
      const supported =
        (order.params.prnReason === 'Fever' && condition?.metric === 'TEMPERATURE') ||
        (order.params.prnReason === 'Pain' && condition?.metric === 'PAIN');
      const rule =
        condition && interval && order.executorKind === 'NURSE' && supported
          ? { condition, interval }
          : null;
      const valid = rule !== null;
      // 疼痛要玩家評估過才有數值；未評估一律 fail closed，唔會亂給藥。
      let next = state;
      const observed =
        condition?.metric === 'TEMPERATURE'
          ? patient.visible.vitals.temp
          : condition?.metric === 'PAIN'
            ? patient.visible.pain
            : null;
      const records = order.administrations ?? [];
      const lastGiven = records.reduce<number | null>(
        (last, dose) => (dose.givenAt === null ? last : Math.max(last ?? 0, dose.givenAt)),
        null,
      );
      const busy = records.some((dose) => dose.status === 'INFUSING' || dose.status === 'PLANNED');
      const triggered = Boolean(
        rule &&
        prnEligible(
          observed,
          rule.condition.comparison,
          rule.condition.threshold,
          state.clock.t,
          null,
          0,
        ),
      );
      const eligible = Boolean(
        rule &&
        triggered &&
        !busy &&
        prnEligible(
          observed,
          rule.condition.comparison,
          rule.condition.threshold,
          state.clock.t,
          lastGiven,
          Number(rule.interval[1]) * 3600,
        ),
      );
      const outcome: NonNullable<Order['prnAssessments']>[number]['outcome'] = !valid
        ? 'INVALID'
        : observed === null
          ? 'UNKNOWN'
          : !triggered
            ? 'NOT_MET'
            : busy
              ? 'INFUSING'
              : eligible
                ? 'ELIGIBLE'
                : 'INTERVAL';
      const value = valid ? observed : null;
      const history = order.prnAssessments ?? [];
      const previous = history.at(-1);
      const prnAssessments =
        previous?.outcome === outcome && previous.observed === value
          ? history
          : [...history, { at: state.clock.t, observed: value, outcome }];
      const assessed = { ...order, prnAssessments };
      next = { ...next, orders: { ...next.orders, [order.id]: assessed } };
      if (eligible) {
        const administrations = planAdministration(
          records,
          order.id,
          order.patientId,
          state.clock.t,
        );
        next = {
          ...next,
          orders: { ...next.orders, [order.id]: { ...assessed, administrations } },
          scheduler: enqueue(next.scheduler, {
            time: state.clock.t,
            priority: 20,
            kind: MEDICATION_DOSE_EVENT_KIND,
            payload: { orderId: order.id, scheduledAt: state.clock.t },
          }),
        };
      }
      return {
        state: {
          ...next,
          scheduler: enqueue(next.scheduler, {
            time: state.clock.t + Math.max(1, ctx.config.vitals.sampleIntervalSeconds),
            priority: 20,
            kind: PRN_CHECK_EVENT_KIND,
            payload: { orderId: order.id },
          }),
        },
        effects: [],
      };
    }
    if (
      event.kind === MEDICATION_DOSE_EVENT_KIND ||
      event.kind === MEDICATION_INFUSION_END_EVENT_KIND
    ) {
      if (
        !isOrderCompletePayload(event.payload) ||
        !('scheduledAt' in event.payload) ||
        typeof event.payload.scheduledAt !== 'number'
      )
        return { state, effects: [] };
      const order = state.orders[event.payload.orderId];
      const scheduledAt = event.payload.scheduledAt;
      const finishing = event.kind === MEDICATION_INFUSION_END_EVENT_KIND;
      const expectedStatus = finishing ? 'INFUSING' : 'PLANNED';
      if (
        order?.status !== 'RUNNING' ||
        !(isScheduledMedication(order, ctx) || Boolean(order.params.prnReason)) ||
        !order.administrations?.some(
          (dose) => dose.scheduledAt === scheduledAt && dose.status === expectedStatus,
        )
      )
        return { state, effects: [] };
      if (state.death?.patientId === order.patientId)
        return { state: cancelOrderState(state, order, 'PATIENT_DECEASED'), effects: [] };
      const duration = order.params.infuseOverMinutes;
      if (!finishing && duration !== undefined) {
        const administrations = startAdministration(
          order.administrations,
          order.id,
          scheduledAt,
          state.clock.t,
        );
        const infusing = { ...order, administrations };
        let next: GameState = {
          ...state,
          orders: { ...state.orders, [order.id]: infusing },
          scheduler: enqueue(state.scheduler, {
            time: state.clock.t + Math.ceil(duration * 60),
            kind: MEDICATION_INFUSION_END_EVENT_KIND,
            payload: { orderId: order.id, scheduledAt },
          }),
        };
        const startedCount = administrations.filter(
          (dose) => dose.status === 'GIVEN' || dose.status === 'INFUSING',
        ).length;
        if (
          isScheduledMedication(infusing, ctx) &&
          order.params.frequency !== 'STAT' &&
          (!order.params.times || startedCount < order.params.times)
        ) {
          next = scheduleDose(next, infusing, scheduledAt + 1, ctx);
        }
        return { state: next, effects: [] };
      }
      const administrations = recordAdministration(
        order.administrations,
        order.id,
        scheduledAt,
        state.clock.t,
      );
      const given = { ...order, administrations };
      const completed = completeOrder(
        { ...state, orders: { ...state.orders, [order.id]: given } },
        given,
        ctx,
      );
      const updated = completed.state.orders[order.id];
      if (updated?.status !== 'DONE') return completed;
      const count = administrations.filter((dose) => dose.status === 'GIVEN').length;
      const remaining = administrations.some(
        (dose) => dose.status === 'PLANNED' || dose.status === 'INFUSING',
      );
      const done =
        !remaining &&
        ((!order.params.prnReason && order.params.frequency === 'STAT') ||
          (order.params.times !== undefined && count >= order.params.times));
      if (done) return completed;
      const active = { ...updated, status: 'RUNNING' as const };
      const nextState = {
        ...completed.state,
        orders: { ...completed.state.orders, [order.id]: active },
      };
      if (order.params.prnReason) return { state: nextState, effects: completed.effects };
      // Infusions planned their next round when they started; non-infusion doses plan it now.
      if (finishing) return { state: nextState, effects: completed.effects };
      return {
        state: isScheduledMedication(active, ctx)
          ? scheduleDose(nextState, active, scheduledAt + 1, ctx)
          : nextState,
        effects: completed.effects,
      };
    }
    if (event.kind !== ORDER_COMPLETE_EVENT_KIND) return undefined;
    if (!isOrderCompletePayload(event.payload)) return { state, effects: [] };
    const order = state.orders[event.payload.orderId];
    if (order?.status !== 'RUNNING' || order.params.prnReason) return { state, effects: [] };
    return completeOrder(state, order, ctx);
  },
};
