import type { ReactNode } from 'react';
import { Armchair, Bath, Coffee, Hospital, Pause, Phone, Play } from 'lucide-react';
import { ui } from '@/i18n';
import type { GameActions, GameView, ShiftView } from '@/view';

export interface ClockBarProps {
  clock: GameView['clock'];
  shift?: ShiftView;
  actions: GameActions;
  ringing?: number;
  onOpenPhone?: () => void;
  tools?: ReactNode;
  places?: { atStation: boolean; onStation: () => void };
}

function dayNight(label: string, segment: ShiftView['segment']): string {
  if (segment === 'DAY') return ui.game.day;
  if (segment === 'NIGHT') return ui.game.night;
  const hour = Number(label.slice(0, 2));
  return hour >= 8 && hour < 18 ? ui.game.day : ui.game.night;
}

export function ClockBar({
  clock,
  shift,
  actions,
  ringing = 0,
  onOpenPhone,
  tools,
  places,
}: ClockBarProps) {
  const g = ui.game;
  const speeds = clock.speeds.filter((s) => s > 0);
  const lockedByFailure = clock.pausedBy === 'ai-failure';
  const lowEnergy = shift !== undefined && shift.energy.level !== 'NORMAL';
  return (
    <div className="clock-bar">
      {shift ? (
        <div className="shift-meta">
          <span className="tag mode-badge" data-testid="mode-badge">
            {ui.shift.mode[shift.shiftMode]}
          </span>
          <span className="title">{ui.game.ward.wardTitle}</span>
          <span className="pill" data-testid="rank-badge">
            {g.youRank(ui.shift.setup.rank[shift.playerRank]?.name ?? shift.playerRank)}
          </span>
          {shift.phase !== 'REGULAR' ? (
            <span className="badge" data-level="ALARM" data-testid="phase-badge">
              {ui.shift.phase[shift.phase]}
            </span>
          ) : null}
          <span
            className="hint round-count"
            data-testid="round-count"
            hidden={shift.rounds.completed === 0}
          >
            {ui.shift.rounds.progress(shift.rounds.completed, shift.rounds.total)}
          </span>
        </div>
      ) : null}
      {places ? (
        <div className="place-chips" role="group" aria-label={ui.game.ward.places}>
          <button
            type="button"
            className="place-chip"
            data-here={places.atStation}
            data-testid="landmark-station"
            aria-pressed={places.atStation}
            onClick={places.onStation}
          >
            <Hospital size={14} strokeWidth={2} aria-hidden="true" />
            <span>{ui.game.ward.station}</span>
          </button>
          <span className="place-chip">
            <Coffee size={14} strokeWidth={2} aria-hidden="true" />
            <span>{ui.game.ward.pantry}</span>
          </span>
          <span className="place-chip">
            <Armchair size={14} strokeWidth={2} aria-hidden="true" />
            <span>{ui.game.ward.rest}</span>
          </span>
          <span className="place-chip">
            <Bath size={14} strokeWidth={2} aria-hidden="true" />
            <span>{ui.game.ward.wc}</span>
          </span>
        </div>
      ) : null}
      {tools}
      <div className="speed-group" role="group" aria-label={g.speedGroup}>
        <span className="speed-lab">{g.speedGroup}</span>
        <button
          type="button"
          className="btn icon-btn"
          aria-pressed={clock.paused}
          disabled={lockedByFailure}
          onClick={actions.togglePause}
          data-testid="pause-toggle"
          aria-label={clock.paused ? g.resume : g.pause}
          title={clock.paused ? g.resume : g.pause}
        >
          {clock.paused ? (
            <Play size={16} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Pause size={16} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
        {speeds.map((speed) => (
          <button
            key={speed}
            type="button"
            className="btn"
            aria-label={g.speedOption(speed)}
            aria-pressed={!clock.paused && !clock.cprSlow && clock.speed === speed}
            disabled={clock.cprSlow}
            title={clock.cprSlow ? g.cprSlowNote : undefined}
            onClick={() => {
              actions.setSpeed(speed);
            }}
          >
            {speed}×
          </button>
        ))}
      </div>
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
          {lowEnergy ? (
            <span className="energy-state">
              {ui.shift.energy.level[shift.energy.level]} · {ui.shift.energy.restShort}
            </span>
          ) : null}
        </div>
      ) : null}
      <p className="clock" aria-label={g.clockLabel}>
        <span className="visually-hidden">{g.clockLabel}</span>
        <time data-testid="game-clock">{clock.label}</time>
        <span className="day-part">{dayNight(clock.label, shift?.segment ?? null)}</span>
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
      {onOpenPhone ? (
        <button
          type="button"
          className="incoming icon-btn"
          data-ringing={ringing > 0}
          data-testid="incoming-call"
          aria-label={
            ringing > 0 ? `${ui.game.ward.incoming} ${String(ringing)}` : ui.game.ward.incoming
          }
          title={ui.game.ward.incoming}
          onClick={onOpenPhone}
        >
          <Phone size={16} strokeWidth={2} aria-hidden="true" />
          {ringing > 0 ? <span>{ringing}</span> : null}
        </button>
      ) : null}
    </div>
  );
}
