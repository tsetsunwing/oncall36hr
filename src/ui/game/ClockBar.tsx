import { ui } from '@/i18n';
import type { GameActions, GameView, ShiftView } from '@/view';

export interface ClockBarProps {
  clock: GameView['clock'];
  shift?: ShiftView;
  actions: GameActions;
}

export function ClockBar({ clock, shift, actions }: ClockBarProps) {
  const g = ui.game;
  const speeds = clock.speeds.filter((s) => s > 0);
  const lockedByFailure = clock.pausedBy === 'ai-failure';
  return (
    <div className="clock-bar">
      {shift ? (
        <div className="shift-meta">
          <span className="badge mode-badge" data-level="NORMAL" data-testid="mode-badge">
            {ui.shift.mode[shift.shiftMode]}
          </span>
          {shift.phase !== 'REGULAR' ? (
            <span className="badge" data-level="ALARM" data-testid="phase-badge">
              {ui.shift.phase[shift.phase]}
            </span>
          ) : null}
          <span className="hint" data-testid="round-count">
            {ui.shift.rounds.progress(shift.rounds.completed, shift.rounds.total)}
          </span>
        </div>
      ) : null}
      <p className="clock" aria-label={g.clockLabel}>
        <span className="clock-label">{g.clockLabel}</span>
        <time data-testid="game-clock">{clock.label}</time>
        {clock.paused ? (
          <span className="badge" data-level="NORMAL" data-testid="paused-badge">
            {g.pausedBadge}
          </span>
        ) : null}
        {shift?.waitingForAi ? (
          <span className="badge" data-level="CAUTION" data-testid="waiting-ai-badge">
            {ui.shift.waitingForAi}
          </span>
        ) : null}
        {clock.cprSlow ? (
          <span className="badge" data-level="ALARM" data-testid="cpr-slow-badge">
            {g.cprSlowBadge}
          </span>
        ) : null}
      </p>
      {shift ? (
        <div
          className="energy-meter"
          data-level={shift.energy.level}
          data-testid="energy-meter"
          role="meter"
          aria-label={ui.shift.energy.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shift.energy.percent)}
          aria-valuetext={`${ui.shift.energy.percent(shift.energy.percent)} ${ui.shift.energy.level[shift.energy.level] ?? ''}`}
        >
          <span className="energy-label">{ui.shift.energy.label}</span>
          <span className="energy-track" aria-hidden="true">
            <span className="energy-fill" style={{ width: `${String(shift.energy.percent)}%` }} />
          </span>
          <strong data-testid="energy-percent">
            {ui.shift.energy.percent(shift.energy.percent)}
          </strong>
          {shift.energy.level !== 'NORMAL' ? (
            <span className="energy-state">{ui.shift.energy.level[shift.energy.level]}</span>
          ) : null}
        </div>
      ) : null}
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
            aria-pressed={!clock.paused && !clock.cprSlow && clock.speed === speed}
            disabled={clock.cprSlow}
            title={clock.cprSlow ? g.cprSlowNote : undefined}
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
