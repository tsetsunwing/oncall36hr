import { ui } from '@/i18n';
import type { GameActions, ShiftView } from '@/view';

const ROOM_ACTIONS = {
  PANTRY: ['MEAL', 'WATER'],
  REST: ['NAP', 'PHONE_CHAT', 'MUSIC'],
  WC: ['TOILET'],
} as const;

export type CarePlace = keyof typeof ROOM_ACTIONS;

export function PlaceRoom({
  place,
  shift,
  actions,
}: {
  place: CarePlace;
  shift: ShiftView;
  actions: GameActions;
}) {
  const s = ui.shift.selfCare;
  const title =
    place === 'PANTRY'
      ? ui.game.ward.pantry
      : place === 'REST'
        ? ui.game.ward.rest
        : ui.game.ward.wc;
  const active = shift.selfCare.active;
  const ids: readonly string[] = ROOM_ACTIONS[place];
  const choices = shift.selfCare.actions.filter((action) => ids.includes(action.id));
  return (
    <section
      className="place-room"
      aria-labelledby="place-room-heading"
      data-testid={`room-${place}`}
    >
      <header className="floor-plan-head">
        <h2 id="place-room-heading">{title}</h2>
      </header>
      {active ? (
        <div className="place-room-active" role="status" data-testid="selfcare-active">
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
      <ul className="place-room-actions">
        {choices.map((action) => (
          <li key={action.id}>
            <button
              type="button"
              className="place-room-action"
              data-testid={`selfcare-${action.id}`}
              disabled={!action.available || active !== null}
              onClick={() => {
                actions.startSelfCare(action.id);
              }}
            >
              <strong>{s.action[action.id]}</strong>
              <span>{s.cost(Math.round(action.durationSec / 60), action.gainPercent)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
