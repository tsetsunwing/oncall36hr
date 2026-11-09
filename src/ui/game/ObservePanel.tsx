import { useState } from 'react';
import { ui } from '@/i18n';
import {
  buildObserveOrder,
  defaultObserveInterval,
  OBSERVE_INTERVALS,
  OBSERVE_PARAMETERS,
  type ObserveIntervalId,
  type ObserveMode,
  type ObserveParameterId,
  type PlacedOrderParams,
} from '@/view';
import { ChoiceSelect } from './ChoiceSelect';

export function ObservePanel({
  onSubmit,
}: {
  onSubmit: (order: { catalogId: string; text: string; params: PlacedOrderParams }) => void;
}) {
  const t = ui.game.chat.observe;
  const [parameter, setParameter] = useState<ObserveParameterId>('vitals');
  const [mode, setMode] = useState<ObserveMode>('once');
  const [interval, setInterval] = useState<ObserveIntervalId>('q15min');
  const parameterPhrase = OBSERVE_PARAMETERS.find((item) => item.id === parameter)?.label ?? '';
  const modePhrase = mode === 'once' ? t.once : t.monitor;
  const intervalPhrase = OBSERVE_INTERVALS.find((item) => item.id === interval)?.phrase ?? '';

  return (
    <form
      className="observe-panel"
      data-testid="observe-panel"
      onSubmit={(event) => {
        event.preventDefault();
        const order = buildObserveOrder(parameter, mode, interval);
        onSubmit({ catalogId: order.catalogId, text: order.text, params: order.params });
      }}
    >
      <div className="drug-order-pack">
        <label className="drug-order-field">
          {t.parameter}
          <ChoiceSelect
            testId="observe-parameter"
            value={parameterPhrase}
            options={OBSERVE_PARAMETERS.map((item) => item.label)}
            optionLabel={(value) => value}
            onValue={(next) => {
              const chosen = OBSERVE_PARAMETERS.find((item) => item.label === next);
              if (!chosen) return;
              setParameter(chosen.id);
              setInterval(defaultObserveInterval(chosen.id));
            }}
          />
        </label>
        <label className="drug-order-field">
          {t.mode}
          <ChoiceSelect
            testId="observe-mode"
            value={modePhrase}
            options={[t.once, t.monitor]}
            optionLabel={(value) => value}
            onValue={(next) => {
              setMode(next === t.monitor ? 'monitor' : 'once');
            }}
          />
        </label>
        {mode === 'monitor' ? (
          <label className="drug-order-field">
            {t.interval}
            <ChoiceSelect
              testId="observe-interval"
              value={intervalPhrase}
              options={OBSERVE_INTERVALS.map((item) => item.phrase)}
              onValue={(next) => {
                const chosen = OBSERVE_INTERVALS.find((item) => item.phrase === next);
                if (chosen) setInterval(chosen.id);
              }}
            />
          </label>
        ) : null}
      </div>
      <div className="drug-order-actions">
        <button type="submit" className="btn btn-primary" data-testid="observe-confirm">
          {t.confirm}
        </button>
      </div>
    </form>
  );
}
