/**
 * Order 完成時嘅搶救鉤子：由 orders 模組喺 `completeOrder` 呼叫。
 * 只有「落咗 order 並且完成」先會影響搶救；完成時間＝玩家落單時間＋執行者固定時長，所以時機由 engine 決定。
 */
import type { OrderCatalogRow } from '../case/tables';
import type { EngineContext } from '../core/module';
import type { GameState } from '../core/state';
import { beginDeath } from '../death/death';
import { logEvent } from '../log/log';
import { composeOrderLabel } from '../orders/label';
import type { Order } from '../orders/orderTypes';
import { addLedger } from '../score/ledger';
import {
  deliverShock,
  giveDrug,
  isArrestOf,
  narrate,
  performRhythmCheck,
  startOrResumeCpr,
  stopResus,
  type OrderLabel,
  type Step,
} from './arrest';
import { aclsModelOf, causeRowsOf, doseMatches } from './model';
import type { Resus } from './resusState';

const LABEL_TOKEN = 'order.1.label';

const none = (state: GameState): Step => ({ state, effects: [] });

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
        next = addLedger(next, {
          category: 'CLINICAL_OUTCOME',
          code: 'CAUSE_TREATED',
          delta: model.scoring.causeTreated.delta,
          patientId: working.patientId,
        });
        next = logEvent(next, { patientId: working.patientId, reasonCode: 'CAUSE_TREATED' });
      }
    }
  }
  return { state: { ...next, resus: working }, resus: working };
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

  if (!isArrestOf(state, order.patientId)) {
    if (!action) return none(state);
    return narrate(
      state,
      order.patientId,
      [{ type: 'ACLS_NOT_APPLICABLE', speaker: 'NURSE', labelToken: label.token }],
      { [label.token]: label.text },
      ctx,
    );
  }

  const recorded = recordCauseOrders(state, state.resus, order, ctx);
  const resus = recorded.resus;
  const next = recorded.state;
  if (!action) return none(next);

  switch (action) {
    case 'CPR_START':
      return startOrResumeCpr(next, resus, ctx, label);
    case 'RHYTHM_CHECK':
      return performRhythmCheck(next, resus, ctx, Math.max(0, order.completesAt - order.startsAt));
    case 'DEFIB': {
      const energy = order.params.dose?.value ?? model.shock.defaultEnergyJ;
      return deliverShock(next, resus, energy, ctx, label);
    }
    case 'DRUG': {
      const rule = model.drugs.find((d) => d.formularyId === order.params.drugFormularyId);
      return giveDrug(
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
      );
    }
    case 'TERMINATE': {
      if (resus.cycles < ctx.config.acls.minCyclesBeforeStop) {
        return narrate(
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
        );
      }
      const stopped = stopResus(next, resus, ctx);
      const died = beginDeath(stopped.state, resus.patientId, ctx);
      return { state: died.state, effects: [...stopped.effects, ...died.effects] };
    }
  }
}
