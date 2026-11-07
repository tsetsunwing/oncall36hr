import { ui } from '@/i18n';
import type { GameActions, ShiftView } from '@/view';

export interface OvertimeBannerProps {
  overtime: NonNullable<ShiftView['overtime']>;
  actions: GameActions;
}

export function OvertimeBanner({ overtime, actions }: OvertimeBannerProps) {
  const o = ui.shift.overtime;
  return (
    <section className="overtime-banner" role="alert" data-testid="overtime-banner">
      <p>
        <strong>{o.banner(overtime.deadlineLabel)}</strong>{' '}
        <span data-testid="overtime-remaining">
          {o.remaining(Math.ceil(overtime.remainingSec / 60))}
        </span>
      </p>
      <p className="hint">{o.frozenNote}</p>
      <button
        type="button"
        className="btn btn-primary"
        data-testid="begin-handover"
        onClick={actions.beginHandover}
      >
        {o.handover}
      </button>
    </section>
  );
}
