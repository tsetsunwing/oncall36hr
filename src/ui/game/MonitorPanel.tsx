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

interface AlertTriangleProps {
  testId: string;
  level: AlarmLevel;
  text: string;
}

/** 黃色三角形驚嘆號：只係圖示，文字只供螢幕閱讀器。 */
function AlertTriangle({ testId, level, text }: AlertTriangleProps) {
  return (
    <span className="alert-tri" data-level={level} data-testid={testId}>
      <svg viewBox="0 0 24 22" aria-hidden="true" focusable="false">
        <path d="M12 1.6 22.6 20.4H1.4Z" fill="#ffd400" stroke="#ffd400" strokeLinejoin="round" />
        <path d="M12 7.6v6.2" stroke="#111" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.4" fill="#111" />
      </svg>
      <span className="visually-hidden">{text}</span>
    </span>
  );
}

interface TileProps {
  testId: string;
  param: string;
  label: string;
  unit: string;
  readout: VitalReadout;
}

function ReadoutValue({ text }: { text: string }) {
  const [main, ...rest] = text.split(' ');
  return (
    <>
      <span className="num">{main}</span>
      {rest.length > 0 ? <span className="num-sub"> {rest.join(' ')}</span> : null}
    </>
  );
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
      data-param="line"
      data-testid="vital-line"
      data-line={slot.kind}
      data-review="PENDING_CLINICAL_REVIEW"
    >
      <div className="tile-label">{label}</div>
      <div className="tile-reading">
        <span className="tile-pending">{m.linePending}</span>
        <span className="visually-hidden"> PENDING_CLINICAL_REVIEW</span>
      </div>
    </div>
  );
}

function Tile({ testId, param, label, unit, readout }: TileProps) {
  const m = ui.game.monitor;
  const alerting = readout.level !== 'NORMAL';
  const hidden = `${m.level[readout.level]} · ${label}${readout.direction ? m.direction[readout.direction] : ''}`;
  return (
    <div className="tile" data-level={readout.level} data-param={param} data-testid={testId}>
      <div className="tile-label">
        {label}
        <span className="tile-unit">{unit}</span>
      </div>
      <div className="tile-reading">
        {alerting ? (
          <AlertTriangle testId={`alert-${param}`} level={readout.level} text={hidden} />
        ) : null}
        <span className="tile-value">
          <ReadoutValue text={readout.text} />
        </span>
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
  const level = maxLevel([
    monitor.mews.level,
    monitor.rhythmAlarm,
    monitor.hr.level,
    monitor.bp.level,
    monitor.spo2.level,
    monitor.rr.level,
    monitor.temp.level,
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
          <span className="monitor-rhythm" data-level={monitor.rhythmAlarm} data-testid="rhythm">
            {monitor.rhythmAlarm !== 'NORMAL' ? (
              <AlertTriangle
                testId="rhythm-alarm-tag"
                level={monitor.rhythmAlarm}
                text={`${m.rhythmAlarm[monitor.rhythmAlarm]}${monitor.pulseless ? ` · ${m.pulseless}` : ''}`}
              />
            ) : null}
            <span className="rhythm-text">
              {m.rhythm}：{monitor.rhythmLabel}
            </span>
          </span>
          <span className="badge" data-level={monitor.mews.level} data-testid="mews-badge">
            {m.mews} {monitor.mews.score}
            <span className="visually-hidden"> · {band}</span>
          </span>
        </p>
      </header>

      <div className="monitor-body">
        <div className="waves" data-level={level}>
          <div className="wave-row" data-wave="ecg">
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
          <div className="wave-row" data-wave="pleth">
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
          <Tile testId="vital-hr" param="hr" label={m.hr} unit={m.hrUnit} readout={monitor.hr} />
          <Tile
            testId="vital-spo2"
            param="spo2"
            label={m.spo2}
            unit={m.spo2Unit}
            readout={monitor.spo2}
          />
          <Tile testId="vital-bp" param="bp" label={m.bp} unit={m.bpUnit} readout={monitor.bp} />
          <LineTile slot={monitor.lineSlot} />
          <Tile testId="vital-rr" param="rr" label={m.rr} unit={m.rrUnit} readout={monitor.rr} />
          <Tile
            testId="vital-temp"
            param="temp"
            label={m.temp}
            unit={m.tempUnit}
            readout={monitor.temp}
          />
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
