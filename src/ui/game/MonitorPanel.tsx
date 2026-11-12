import { useState, type ReactNode } from 'react';
import { ui } from '@/i18n';
import { ECG_LEADS, type EcgLead } from '@/view';
import type { AlarmLevel, MonitorView, PatientView, VitalBand, VitalReadout } from '@/view';
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
        <path
          d="M12 1.6 22.6 20.4H1.4Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
        />
        <path d="M12 7.6v6.2" stroke="var(--mon-bg)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1.4" fill="var(--mon-bg)" />
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
  measure?: ReactNode;
}

/** 中度黃色、嚴重紅色。只係驚嘆號，冇警報句子。 */
function VitalMark({
  testId,
  band,
}: {
  testId: string;
  band: Extract<VitalBand, 'moderate' | 'severe'>;
}) {
  return (
    <span className="vital-mark" data-band={band} data-testid={testId}>
      <svg viewBox="0 0 8 24" aria-hidden="true" focusable="false">
        <rect x="2.1" y="0.4" width="3.8" height="14.2" rx="1.2" fill="currentColor" />
        <circle cx="4" cy="20.4" r="2.15" fill="currentColor" />
      </svg>
    </span>
  );
}

function markedBand(band: VitalBand): Extract<VitalBand, 'moderate' | 'severe'> | null {
  return band === 'moderate' || band === 'severe' ? band : null;
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

function MeasureButton({
  label,
  testId,
  onClick,
}: {
  label: string;
  testId: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="measure-mark"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M8 4.2 V8.2 L10.6 10.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function Tile({ testId, param, label, unit, readout, measure }: TileProps) {
  const mark = markedBand(readout.band);
  return (
    <div className="tile" data-band={readout.band} data-param={param} data-testid={testId}>
      <div className="tile-label">
        <span className="tile-name">
          {label}
          {measure}
        </span>
        <span className="tile-unit">{unit}</span>
      </div>
      <div className="tile-reading">
        {mark ? <VitalMark testId={`alert-${param}`} band={mark} /> : null}
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
  /** 再量一次 NIBP。畫面讀數由 engine 嘅上次袖帶決定。 */
  onMeasureNibp?: () => void;
}

function OptionalTile({ kind, bp }: { kind: OptionalWave; bp: VitalReadout | null }) {
  const m = ui.game.monitor;
  const label = m.optionalWave[kind] ?? kind;
  const unit = kind === 'cvp' ? m.cvpUnit : m.bpUnit;
  const reading = kind === 'abp' ? bp : null;
  const mark = reading ? markedBand(reading.band) : null;
  return (
    <div
      className="tile"
      data-band={reading?.band ?? 'normal'}
      data-param={kind}
      data-testid={`vital-${kind}`}
      data-review="PENDING_CLINICAL_REVIEW"
    >
      <div className="tile-label">
        {label}
        <span className="tile-unit">{unit}</span>
      </div>
      <div className="tile-reading">
        {mark ? <VitalMark testId={`alert-${kind}`} band={mark} /> : null}
        {reading ? (
          <span className="tile-value">
            <ReadoutValue text={reading.text} />
          </span>
        ) : (
          <>
            <span className="tile-value">
              <span className="num">—</span>
            </span>
            <span className="visually-hidden">{m.noReading}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function MonitorPanel({ patient, monitor, onMeasureNibp }: MonitorPanelProps) {
  const m = ui.game.monitor;
  const [seenBed, setSeenBed] = useState(patient.bed);
  const [lead, setLead] = useState<EcgLead>('II');
  const [extra, setExtra] = useState<OptionalWave[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tempByBed, setTempByBed] = useState<ReadonlyMap<number, VitalReadout>>(() => new Map());
  const rememberedTemp = tempByBed.get(patient.bed);
  if (!rememberedTemp) {
    const next = new Map(tempByBed);
    next.set(patient.bed, { ...monitor.temp });
    setTempByBed(next);
  }
  const temp = rememberedTemp ?? monitor.temp;
  if (seenBed !== patient.bed) {
    setSeenBed(patient.bed);
    setLead('II');
    setExtra([]);
    setMenuOpen(false);
  }
  // 有動脈導管就自動顯示 ABP，唔需要玩家喺波形選單揀。其餘額外波形仍然由玩家決定。
  const autoExtra: OptionalWave[] = monitor.lines.abp ? ['abp'] : [];
  const shownExtra = [...new Set([...autoExtra, ...extra])]
    .filter((kind) => monitor.lines[kind])
    .slice(0, MAX_OPTIONAL);
  const level = maxLevel([
    monitor.mews.level,
    monitor.rhythmAlarm,
    monitor.hr.level,
    monitor.bp.level,
    monitor.spo2.level,
    monitor.rr.level,
    temp.level,
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
            readout={monitor.bp}
            measure={
              <MeasureButton
                label={m.measureNibp}
                testId="measure-nibp"
                onClick={() => {
                  onMeasureNibp?.();
                }}
              />
            }
          />
          <Tile testId="vital-rr" param="rr" label={m.rr} unit={m.rrUnit} readout={monitor.rr} />
          <Tile
            testId="vital-temp"
            param="temp"
            label={m.temp}
            unit={m.tempUnit}
            readout={temp}
            measure={
              <MeasureButton
                label={m.measureTemp}
                testId="measure-temp"
                onClick={() => {
                  setTempByBed((current) => {
                    const next = new Map(current);
                    next.set(patient.bed, { ...monitor.temp });
                    return next;
                  });
                }}
              />
            }
          />
          {shownExtra.map((kind) => (
            <OptionalTile key={kind} kind={kind} bp={kind === 'abp' ? monitor.abp : null} />
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
              // ABP 有導管就自動開，所以選單裡面固定勾住、唔可以由玩家關掉。
              const auto = kind === 'abp' && monitor.lines.abp;
              const checked = ready && (auto || extra.includes(kind));
              const full = extra.length >= MAX_OPTIONAL && !checked;
              return (
                <label key={kind} title={ready ? undefined : m.waveNeeds[kind]}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!ready || full || auto}
                    onChange={() => {
                      if (!ready || auto) return;
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
