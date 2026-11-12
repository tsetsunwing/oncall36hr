/**
 * Order 完成時嘅搶救鉤子：由 orders 模組喺 `completeOrder` 呼叫。
 * 只有「落咗 order 並且完成」先會影響搶救；完成時間＝玩家落單時間＋執行者固定時長，所以時機由 engine 決定。
 */
import type { AclsAction, EngineTables, OrderCatalogRow, RhythmRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { beginDeath } from '../death/death';
import { logEvent } from '../log/log';
import { composeOrderLabel } from '../orders/label';
import type { Order } from '../orders/orderTypes';
import { applyRule } from '../score/scoring';
import {
  beginArrest,
  deliverShock,
  giveDrug,
  isArrestOf,
  narrate,
  performRhythmCheck,
  resusOf,
  startOrResumeCpr,
  stopResus,
  type OrderLabel,
  type Step,
} from './arrest';
import { aclsModelOf, causeRowsOf, doseMatches, rhythmOf } from './model';
import type { Resus } from './resusState';

const LABEL_TOKEN = 'order.1.label';

const none = (state: GameState): Step => ({ state, effects: [] });

export type AclsNurseDecision = 'PROCEED' | 'NOT_ARREST' | 'NON_SHOCKABLE';

function shownRhythm(
  state: GameState,
  patientId: string,
  tables: EngineTables,
): RhythmRow | undefined {
  const visible = state.patients[patientId]?.visible.rhythm;
  if (visible) return rhythmOf(tables, visible);
  const own = resusOf(state, patientId);
  if (own?.status === 'ARREST') return rhythmOf(tables, own.rhythm);
  return undefined;
}

/** 監察儀 Asystole 或無脈搏就係心跳停搏，唔好當病人仲有脈搏。 */
function monitorShowsArrest(rhythm: RhythmRow | undefined): rhythm is RhythmRow {
  return rhythm != null && (rhythm.id === 'ASYSTOLE' || !rhythm.pulse);
}

/**
 * 護士應唔應該做呢個 ACLS order。
 * 無脈搏（包括 asystole）係心跳停搏：CPR 要做。
 * Asystole 同其他不可電擊節律唔好電擊，原因要跟返監察儀，唔好話唔係心跳停搏。
 */
export function aclsNurseDecision(
  state: GameState,
  patientId: string,
  action: AclsAction | undefined,
  tables: EngineTables,
): AclsNurseDecision {
  if (!action) return 'PROCEED';
  const rhythm = shownRhythm(state, patientId, tables);
  const arrest = isArrestOf(state, patientId) || monitorShowsArrest(rhythm);
  if (!arrest) return 'NOT_ARREST';
  if (
    action === 'DEFIB' &&
    rhythm != null &&
    (rhythm.id === 'ASYSTOLE' || (!rhythm.pulse && !rhythm.shockable))
  ) {
    return 'NON_SHOCKABLE';
  }
  return 'PROCEED';
}

function ensureShownArrest(state: GameState, patientId: string, ctx: EngineContext): Step {
  if (isArrestOf(state, patientId)) return none(state);
  const rhythm = shownRhythm(state, patientId, ctx.tables);
  if (!monitorShowsArrest(rhythm)) return none(state);
  return beginArrest(state, patientId, rhythm.id, ctx, {
    rearrest: resusOf(state, patientId) !== undefined,
  });
}

function recordCauseOrders(
  state: GameState,
  resus: Resus,
  order: Order,
  ctx: EngineContext,
): { state: GameState; resus: Resus } {
  const model = aclsModelOf(ctx.tables);
  let working = resus;
  let next = state;
  for (const cause of causeRowsOf(ctx.tables)) {
    if (
      cause.checkCatalogIds.includes(order.catalogId) &&
      !working.checkedCauses.includes(cause.id)
    ) {
      working = { ...working, checkedCauses: [...working.checkedCauses, cause.id] };
    }
    if (
      cause.treatCatalogIds.includes(order.catalogId) &&
      !working.treatedCauses.includes(cause.id)
    ) {
      working = { ...working, treatedCauses: [...working.treatedCauses, cause.id] };
      if (working.causeIds.includes(cause.id) && model) {
        next = applyRule(next, 'CAUSE_TREATED', ctx, {
          patientId: working.patientId,
          evidence: `order:${order.id}`,
        });
        next = logEvent(next, { patientId: working.patientId, reasonCode: 'CAUSE_TREATED' });
      }
    }
  }
  return {
    state: { ...next, resus: { ...next.resus, [working.patientId]: working } },
    resus: working,
  };
}

export function applyAclsOrder(
  state: GameState,
  order: Order,
  row: OrderCatalogRow,
  ctx: EngineContext,
): Step {
  const model = aclsModelOf(ctx.tables);
  if (!model) return none(state);
  const label: OrderLabel = { token: LABEL_TOKEN, text: composeOrderLabel(row, order) };
  const action = row.acls?.action;
  if (!action) {
    if (!isArrestOf(state, order.patientId)) return none(state);
    const own = resusOf(state, order.patientId);
    return own ? none(recordCauseOrders(state, own, order, ctx).state) : none(state);
  }
  const decision = aclsNurseDecision(state, order.patientId, action, ctx.tables);

  if (decision === 'NON_SHOCKABLE') {
    const rhythm = shownRhythm(state, order.patientId, ctx.tables);
    return narrate(
      state,
      order.patientId,
      [
        {
          type: 'ACLS_SHOCK_REFUSED',
          speaker: 'NURSE',
          labelToken: label.token,
          tokens: ['rhythm.label'],
        },
      ],
      {
        [label.token]: label.text,
        'rhythm.label': rhythm?.label ?? '',
      },
      ctx,
      { catalogId: row.id, label: label.text },
    );
  }

  if (decision === 'NOT_ARREST') {
    return narrate(
      state,
      order.patientId,
      [{ type: 'ACLS_NOT_APPLICABLE', speaker: 'NURSE', labelToken: label.token }],
      { [label.token]: label.text },
      ctx,
      { catalogId: row.id, label: label.text },
    );
  }

  const ensured = ensureShownArrest(state, order.patientId, ctx);
  if (!isArrestOf(ensured.state, order.patientId)) {
    if (monitorShowsArrest(shownRhythm(ensured.state, order.patientId, ctx.tables))) return ensured;
    const refused = narrate(
      ensured.state,
      order.patientId,
      [{ type: 'ACLS_NOT_APPLICABLE', speaker: 'NURSE', labelToken: label.token }],
      { [label.token]: label.text },
      ctx,
      { catalogId: row.id, label: label.text },
    );
    return { state: refused.state, effects: [...ensured.effects, ...refused.effects] };
  }

  const own = resusOf(ensured.state, order.patientId);
  if (!own) return none(ensured.state);
  const recorded = recordCauseOrders(ensured.state, own, order, ctx);
  const resus = recorded.resus;
  const next = recorded.state;

  const finish = (step: Step): Step => ({
    state: step.state,
    effects: [...ensured.effects, ...step.effects],
  });

  switch (action) {
    case 'CPR_START':
      return finish(startOrResumeCpr(next, resus, ctx, label));
    case 'RHYTHM_CHECK':
      return finish(
        performRhythmCheck(next, resus, ctx, Math.max(0, order.completesAt - order.startsAt)),
      );
    case 'DEFIB': {
      const energy = order.params.dose?.value ?? model.shock.defaultEnergyJ;
      return finish(deliverShock(next, resus, energy, ctx, label));
    }
    case 'DRUG': {
      const rule = model.drugs.find((d) => d.formularyId === order.params.drugFormularyId);
      return finish(
        giveDrug(
          next,
          resus,
          {
            formularyId: order.params.drugFormularyId ?? order.catalogId,
            dose: order.params.dose,
            at: next.clock.t,
            doseOk: rule ? doseMatches(order.params.dose, rule.dose) : true,
          },
          ctx,
          label,
        ),
      );
    }
    case 'TERMINATE': {
      if (
        state.patients[resus.patientId]?.demographics.code !== 'DNR' &&
        resus.cycles < ctx.config.acls.minCyclesBeforeStop
      ) {
        return finish(
          narrate(
            logEvent(next, { patientId: resus.patientId, reasonCode: 'STOP_REFUSED' }),
            resus.patientId,
            [
              {
                type: 'ACLS_STOP_REFUSED',
                speaker: 'NURSE',
                tokens: ['acls.cycles', 'acls.minCycles'],
              },
            ],
            {
              'acls.cycles': String(resus.cycles),
              'acls.minCycles': String(ctx.config.acls.minCyclesBeforeStop),
            },
            ctx,
          ),
        );
      }
      const stopped = stopResus(next, resus, ctx);
      const died = beginDeath(stopped.state, resus.patientId, ctx);
      return {
        state: died.state,
        effects: [...ensured.effects, ...stopped.effects, ...died.effects],
      };
    }
  }
}
