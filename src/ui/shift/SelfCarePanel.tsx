import { dialogue, ui } from '@/i18n';
import type { GameActions, ShiftView } from '@/view';

export interface SelfCarePanelProps {
  shift: ShiftView;
  notice: { kind: string } | null;
  actions: GameActions;
}

export function SelfCarePanel({ shift, notice, actions }: SelfCarePanelProps) {
  const s = ui.shift.selfCare;
  const active = shift.selfCare.active;
  const energy = shift.energy;
  return (
    <section className="selfcare" aria-labelledby="selfcare-heading" data-testid="selfcare-panel">
      <h2 id="selfcare-heading" className="panel-title">
        {s.heading}
      </h2>
      <p className="energy-line" data-level={energy.level} data-testid="energy-line">
        {(['fatigue', 'hunger', 'bladder'] as const).map((key, index) => (
          <span key={key}>
            {index > 0 ? ' · ' : ''}
            {ui.shift.energy.need[key]} {ui.shift.energy.percent(shift.needs[key].percent)}
          </span>
        ))}
      </p>
      {notice?.kind === 'REST_NUDGE' ? (
        <p className="rest-nudge" role="status" data-testid="rest-nudge">
          <span className="badge" data-level="NORMAL">
            RN
          </span>{' '}
          {dialogue['shift.restNudge']}
        </p>
      ) : null}
      {notice?.kind === 'BLADDER_ACCIDENT' ? (
        <p className="rest-nudge" role="status" data-testid="bladder-accident">
          {dialogue['shift.bladderAccident']}
        </p>
      ) : null}
      <p className="hint">{s.hint}</p>
      {active ? (
        <div className="selfcare-active" role="status" data-testid="selfcare-active">
          <p>{s.busy(s.action[active.id] ?? active.id, active.endsLabel)}</p>
          <button
            type="button"
            className="btn"
            data-testid="selfcare-stop"
            onClick={actions.stopSelfCare}
          >
            {s.stop}
          </button>
        </div>
      ) : null}
      {shift.selfCare.mealWindowOpen ? (
        <p className="badge" data-level="CAUTION" data-testid="meal-window">
          {s.mealWindow}
        </p>
      ) : null}
      <ul className="selfcare-list">
        {shift.selfCare.actions.map((action) => (
          <li key={action.id} className="selfcare-row">
            <div>
              <strong>{s.action[action.id]}</strong>
              <span className="hint">
                {s.detail[action.id]} ·{' '}
                {s.cost(Math.round(action.durationSec / 60), action.gainPercent)}
              </span>
              {!action.available && action.needsMealWindow && action.cooldownSec === 0 ? (
                <span className="hint">{s.unavailableMeal}</span>
              ) : null}
              {action.cooldownSec > 0 ? (
                <span className="hint">{s.cooldown(Math.ceil(action.cooldownSec / 60))}</span>
              ) : null}
            </div>
            <button
              type="button"
              className="btn"
              data-testid={`selfcare-${action.id}`}
              disabled={!action.available}
              onClick={() => {
                actions.startSelfCare(action.id);
              }}
            >
              {s.start}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
