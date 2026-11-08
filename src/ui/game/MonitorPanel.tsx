import { ui } from '@/i18n';
import type { AlarmLevel, MonitorView, PatientView, VitalReadout } from '@/view';
import { WaveformCanvas } from './WaveformCanvas';

const LEVEL_ORDER: Record<AlarmLevel, number> = { NORMAL: 0, CAUTION: 1, ALARM: 2 };

function maxLevel(levels: AlarmLevel[]): AlarmLevel {
  return levels.reduce<AlarmLevel>(
    (acc, level) => (LEVEL_ORDER[level] > LEVEL_ORDER[acc] ? level : acc),
    'NORMAL',
  );
}

interface TileProps {
  testId: string;
  label: string;
  unit: string;
  readout: VitalReadout;
}

function LineTile({ slot }: { slot: MonitorView['lineSlot'] }) {
  const m = ui.game.monitor;
  if (!slot.kind) {
    return <div className="tile tile-empty" data-testid="vital-line" data-line="none" />;
  }
  const label = slot.kind === 'ALINE' ? m.aline : m.cvp;
  return (
    <div
      className="tile"
      data-level="NORMAL"
      data-testid="vital-line"
      data-line={slot.kind}
      data-review="PENDING_CLINICAL_REVIEW"
    >
      <div className="tile-label">{label}</div>
      <div className="tile-value" />
      <div className="tile-flag">
        {m.linePending}
        <span className="visually-hidden"> PENDING_CLINICAL_REVIEW</span>
      </div>
    </div>
  );
}

function Tile({ testId, label, unit, readout }: TileProps) {
  const m = ui.game.monitor;
  return (
    <div className="tile" data-level={readout.level} data-testid={testId}>
      <div className="tile-label">
        {label} <span className="tile-unit">{unit}</span>
      </div>
      <div className="tile-value">{readout.text}</div>
      <div className="tile-flag">
        {readout.direction ? (
          <>
            <span aria-hidden="true">{readout.direction === 'HIGH' ? '↑' : '↓'}</span>
            {m.direction[readout.direction]}
          </>
        ) : null}
      </div>
    </div>
  );
}

export interface MonitorPanelProps {
  patient: PatientView;
  monitor: MonitorView;
}

export function MonitorPanel({ patient, monitor }: MonitorPanelProps) {
  const m = ui.game.monitor;
  const tiles: { key: keyof typeof m.tagLabel; readout: VitalReadout }[] = [
    { key: 'hr', readout: monitor.hr },
    { key: 'bp', readout: monitor.bp },
    { key: 'spo2', readout: monitor.spo2 },
    { key: 'rr', readout: monitor.rr },
    { key: 'temp', readout: monitor.temp },
  ];
  const tags = tiles.filter((t) => t.readout.level !== 'NORMAL');
  const level = maxLevel([
    monitor.mews.level,
    monitor.rhythmAlarm,
    ...tiles.map((t) => t.readout.level),
  ]);
  const band = (m.band as Record<string, string>)[monitor.mews.bandId] ?? monitor.mews.bandId;

  return (
    <section
      className="monitor"
      data-level={level}
      data-testid="monitor"
      aria-labelledby="monitor-heading"
    >
      <header className="monitor-head">
        <h2 id="monitor-heading" className="monitor-title">
          Bed {patient.bed} · {patient.name}
          <span className="monitor-sub">
            {patient.age}
            {patient.sex} · {patient.complaint}
          </span>
        </h2>
        <p className="monitor-badges">
          <span className="badge" data-level={monitor.mews.level} data-testid="mews-badge">
            {m.mews} {monitor.mews.score}
            <span className="visually-hidden"> · {band}</span>
          </span>
          <span className="monitor-rhythm" data-testid="rhythm">
            {m.rhythm}：{monitor.rhythmLabel}
          </span>
        </p>
      </header>

      <ul className="alarm-tags" aria-label={m.level.ALARM} data-testid="alarm-tags">
        {monitor.rhythmAlarm !== 'NORMAL' ? (
          <li className="alarm-tag" data-level={monitor.rhythmAlarm} data-testid="rhythm-alarm-tag">
            {m.rhythmAlarm[monitor.rhythmAlarm]} · {monitor.rhythmLabel}
            {monitor.pulseless ? ` · ${m.pulseless}` : ''}
          </li>
        ) : null}
        {tags.length === 0 && monitor.rhythmAlarm === 'NORMAL' ? (
          <li className="alarm-tag" data-level="NORMAL">
            {m.noAlarm}
          </li>
        ) : (
          tags.map(({ key, readout }) => (
            <li key={key} className="alarm-tag" data-level={readout.level}>
              {m.level[readout.level]} · {m.tagLabel[key]}
              {readout.direction ? m.direction[readout.direction] : ''} {readout.text}
            </li>
          ))
        )}
      </ul>

      <div className="monitor-body">
        <div className="waves" data-level={level}>
          <div className="wave-row">
            <span className="wave-label">{m.leadII}</span>
            <WaveformCanvas
              kind="ecg"
              wave={monitor.wave}
              hr={monitor.waveRate}
              amplitude={monitor.pulseAmplitude}
              sweepSeconds={monitor.sweepSeconds}
              targetFps={monitor.targetFps}
              label={m.waveformLabel}
            />
          </div>
          <div className="wave-row">
            <span className="wave-label">{m.pleth}</span>
            <WaveformCanvas
              kind="pleth"
              wave={monitor.wave}
              hr={monitor.waveRate}
              amplitude={monitor.pulseAmplitude}
              sweepSeconds={monitor.sweepSeconds}
              targetFps={monitor.targetFps}
              label={m.waveformLabel}
            />
          </div>
        </div>
        <div className="tiles">
          <Tile testId="vital-hr" label={m.hr} unit={m.hrUnit} readout={monitor.hr} />
          <Tile testId="vital-spo2" label={m.spo2} unit={m.spo2Unit} readout={monitor.spo2} />
          <Tile testId="vital-bp" label={m.bp} unit={m.bpUnit} readout={monitor.bp} />
          <LineTile slot={monitor.lineSlot} />
          <Tile testId="vital-rr" label={m.rr} unit={m.rrUnit} readout={monitor.rr} />
          <Tile testId="vital-temp" label={m.temp} unit={m.tempUnit} readout={monitor.temp} />
        </div>
      </div>
      <p className="monitor-foot">
        {m.consciousnessLabel}：{m.consciousness[monitor.consciousness]} · {m.asOf}{' '}
        {monitor.asOfLabel}
      </p>
      {monitor.mews.reviewPending ? <p className="monitor-note">{m.mewsPending}</p> : null}
    </section>
  );
}
