import { ui } from '@/i18n';
import type { GameActions, GameView } from '@/view';

export interface ClockBarProps {
  clock: GameView['clock'];
  actions: GameActions;
}

export function ClockBar({ clock, actions }: ClockBarProps) {
  const g = ui.game;
  const speeds = clock.speeds.filter((s) => s > 0);
  const lockedByFailure = clock.pausedBy === 'ai-failure';
  return (
    <div className="clock-bar">
      <p className="clock" aria-label={g.clockLabel}>
        <span className="clock-label">{g.clockLabel}</span>
        <time data-testid="game-clock">{clock.label}</time>
        {clock.paused ? (
          <span className="badge" data-level="NORMAL" data-testid="paused-badge">
            {g.pausedBadge}
          </span>
        ) : null}
      </p>
      <div className="speed-group" role="group" aria-label={g.speedGroup}>
        <button
          type="button"
          className="btn"
          disabled={lockedByFailure}
          onClick={actions.togglePause}
          data-testid="pause-toggle"
        >
          {clock.paused ? g.resume : g.pause}
        </button>
        {speeds.map((speed) => (
          <button
            key={speed}
            type="button"
            className="btn"
            aria-pressed={!clock.paused && clock.speed === speed}
            onClick={() => {
              actions.setSpeed(speed);
            }}
          >
            {g.speedOption(speed)}
          </button>
        ))}
      </div>
    </div>
  );
}
