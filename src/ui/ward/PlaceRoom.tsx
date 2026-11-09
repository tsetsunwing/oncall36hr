import { Bath, BedDouble, Utensils, type LucideIcon } from 'lucide-react';
import { ui } from '@/i18n';
import type { GameActions, ShiftView } from '@/view';

const ROOM_ACTIONS = {
  PANTRY: ['MEAL', 'WATER'],
  REST: ['NAP', 'PHONE_CHAT', 'MUSIC'],
  WC: ['TOILET'],
} as const;

const ROOM_ICON: Record<keyof typeof ROOM_ACTIONS, LucideIcon> = {
  PANTRY: Utensils,
  REST: BedDouble,
  WC: Bath,
};

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
  const activeId = active?.id ?? null;
  const ids: readonly string[] = ROOM_ACTIONS[place];
  const choices = shift.selfCare.actions.filter((action) => ids.includes(action.id));
  const Icon = ROOM_ICON[place];
  return (
    <section
      className="place-room"
      aria-labelledby="place-room-heading"
      data-testid={`room-${place}`}
    >
      <header className="floor-plan-head">
        <h2 id="place-room-heading">
          <Icon className="heading-icon" size={16} strokeWidth={2} aria-hidden="true" />
          {title}
        </h2>
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
              data-active={action.id === activeId ? 'true' : 'false'}
              disabled={!action.available || activeId !== null}
              onClick={() => {
                actions.startSelfCare(action.id);
              }}
            >
              <strong>{s.action[action.id]}</strong>
              <span>
                {action.id === activeId && active
                  ? `預計 ${active.endsLabel} 完成`
                  : s.cost(Math.round(action.durationSec / 60), action.gainPercent)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
