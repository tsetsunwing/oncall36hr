import { useState, type ReactNode } from 'react';
import { ui } from '@/i18n';
import { ECG_LEADS, type EcgLead } from '@/view';
import type { AlarmLevel, MonitorView, PatientView, VitalReadout } from '@/view';
import { WaveformCanvas, type WaveKind } from './WaveformCanvas';

const OPTIONAL_WAVES = ['abp', 'cvp', 'etco2'] as const;
type OptionalWave = (typeof OPTIONAL_WAVES)[number];
const MAX_OPTIONAL = 2;

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
  extra?: ReactNode;
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

function Tile({ testId, param, label, unit, readout, extra }: TileProps) {
  const m = ui.game.monitor;
  const alerting = readout.level !== 'NORMAL';
  const hidden = `${m.level[readout.level]} · ${label}${readout.direction ? m.direction[readout.direction] : ''}`;
  return (
    <div className="tile" data-level={readout.level} data-param={param} data-testid={testId}>
      <div className="tile-label">
        {label}
        <span className="tile-unit">{unit}</span>
        {extra}
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

function OptionalTile({ kind }: { kind: OptionalWave }) {
  const m = ui.game.monitor;
  const label = m.optionalWave[kind] ?? kind;
  const unit = kind === 'cvp' ? m.cvpUnit : m.bpUnit;
  return (
    <div
      className="tile"
      data-level="NORMAL"
      data-param={kind}
      data-testid={`vital-${kind}`}
      data-review="PENDING_CLINICAL_REVIEW"
    >
      <div className="tile-label">
        {label}
        <span className="tile-unit">{unit}</span>
      </div>
      <div className="tile-reading">
        <span className="tile-value">
          <span className="num">—</span>
        </span>
        <span className="visually-hidden">{m.noReading}</span>
      </div>
    </div>
  );
}

export function MonitorPanel({ patient, monitor }: MonitorPanelProps) {
  const m = ui.game.monitor;
  const [seenBed, setSeenBed] = useState(patient.bed);
  const [lead, setLead] = useState<EcgLead>('II');
  const [extra, setExtra] = useState<OptionalWave[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nibpByBed, setNibpByBed] = useState<ReadonlyMap<number, VitalReadout>>(() => new Map());
  const remembered = nibpByBed.get(patient.bed);
  if (!remembered) {
    const next = new Map(nibpByBed);
    next.set(patient.bed, {
      text: monitor.bp.text,
      level: monitor.bp.level,
      direction: monitor.bp.direction,
    });
    setNibpByBed(next);
  }
  const nibp = remembered ?? monitor.bp;
  if (seenBed !== patient.bed) {
    setSeenBed(patient.bed);
    setLead('II');
    setExtra([]);
    setMenuOpen(false);
  }
  const shownExtra = extra.filter((kind) => monitor.lines[kind]);
  const level = maxLevel([
    monitor.mews.level,
    monitor.rhythmAlarm,
    monitor.hr.level,
    nibp.level,
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
            <label className="wave-label">
              <span className="visually-hidden">{m.leadMenu}</span>
              <select
                className="wave-lead"
                aria-label={m.leadMenu}
                value={lead}
                onChange={(event) => {
                  setLead(event.target.value as EcgLead);
                }}
              >
                {ECG_LEADS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <WaveformCanvas
              kind="ecg"
              lead={lead}
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
          {shownExtra.map((kind) => (
            <div key={kind} className="wave-row" data-wave={kind}>
              <span className="wave-label">{m.optionalWave[kind]}</span>
              <WaveformCanvas
                kind={kind as WaveKind}
                wave={monitor.wave}
                hr={monitor.waveRate}
                rr={Number(monitor.rr.text) || 16}
                amplitude={monitor.pulseAmplitude}
                sweepSeconds={monitor.sweepSeconds}
                targetFps={monitor.targetFps}
                label={m.optionalWaveLabel(m.optionalWave[kind] ?? kind)}
              />
            </div>
          ))}
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
          <Tile
            testId="vital-bp"
            param="bp"
            label={m.bp}
            unit={m.bpUnit}
            readout={nibp}
            extra={
              <button
                type="button"
                className="nibp-measure"
                data-testid="measure-nibp"
                onClick={() => {
                  setNibpByBed((current) => {
                    const next = new Map(current);
                    next.set(patient.bed, {
                      text: monitor.bp.text,
                      level: monitor.bp.level,
                      direction: monitor.bp.direction,
                    });
                    return next;
                  });
                }}
              >
                {m.measureNibp}
              </button>
            }
          />
          <Tile testId="vital-rr" param="rr" label={m.rr} unit={m.rrUnit} readout={monitor.rr} />
          <Tile
            testId="vital-temp"
            param="temp"
            label={m.temp}
            unit={m.tempUnit}
            readout={monitor.temp}
          />
          {shownExtra.map((kind) => (
            <OptionalTile key={kind} kind={kind} />
          ))}
        </div>
      </div>
      <p className="monitor-foot">
        {m.consciousnessLabel}：{m.consciousness[monitor.consciousness]} · {m.asOf}{' '}
        {monitor.asOfLabel}
      </p>
      <div className="monitor-note">
        <button
          type="button"
          className="wave-pick"
          aria-expanded={menuOpen}
          aria-controls="optional-waves"
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
        >
          {m.waveMenu}
        </button>
        {menuOpen ? (
          <div id="optional-waves" className="wave-menu" role="group" aria-label={m.waveMenu}>
            {OPTIONAL_WAVES.map((kind) => {
              const ready = monitor.lines[kind];
              const checked = ready && extra.includes(kind);
              const full = extra.length >= MAX_OPTIONAL && !checked;
              return (
                <label key={kind} title={ready ? undefined : m.waveNeeds[kind]}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!ready || full}
                    onChange={() => {
                      if (!ready) return;
                      setExtra((current) => {
                        if (current.includes(kind)) return current.filter((item) => item !== kind);
                        if (current.length >= MAX_OPTIONAL) return current;
                        return [...current, kind];
                      });
                    }}
                  />
                  {m.optionalWave[kind]}
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
