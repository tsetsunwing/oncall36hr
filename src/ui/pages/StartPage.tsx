import { useState } from 'react';
import {
  AlarmClock,
  BedDouble,
  CircleAlert,
  CircleUserRound,
  Gauge,
  Moon,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { OPEN_WARDS, wardLabel } from '@/content/wards';
import { ui } from '@/i18n';
import { normalizeSettings, validateSettings, type SaveSlotView, type Settings } from '@/storage';
import type { StartGate } from '@/view';
import { SaveLibrary } from '../saves/SaveLibrary';
import { AiSettingsFields } from './AiSettingsFields';
import { describeOutcome, type ConnectionOutcome } from './SettingsPage';

export type SetupRank = 'HO' | 'MO' | 'RES';
export type SetupDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type SetupMode = 'DAY' | 'NIGHT' | 'ONCALL';
/** 病房代碼（src/content/wards.ts）；現階段只有 MED、SRG */
export type SetupWard = string;

export interface StartChoice {
  rank: SetupRank;
  difficulty: SetupDifficulty;
  mode: SetupMode;
  ward: SetupWard;
}

export interface StartPageProps {
  gate: StartGate;
  onStart: (choice: StartChoice) => void;
  settings?: Settings;
  onSettingsChange?: (settings: Settings) => void;
  slots?: SaveSlotView[];
  saveMessage?: string | null;
  onContinue?: (id: string) => void;
  onDelete?: (id: string) => void;
  onExport?: (id: string) => void;
  onImport?: (slot: number, json: string) => void;
  onTestConnection?: (settings: Settings) => Promise<ConnectionOutcome>;
}

const RANKS: readonly SetupRank[] = ['HO', 'MO', 'RES'];
const DIFFICULTIES: readonly SetupDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const MODES: readonly SetupMode[] = ['DAY', 'NIGHT', 'ONCALL'];
const WARDLIST = OPEN_WARDS;

interface ChoiceGroupProps<T extends string> {
  name: string;
  legend: string;
  hint: string;
  value: T;
  options: readonly {
    id: T;
    title: string;
    line1: string;
    line2?: string | undefined;
    icon: LucideIcon;
  }[];
  onChange: (value: T) => void;
}

function ChoiceGroup<T extends string>({
  name,
  legend,
  hint,
  value,
  options,
  onChange,
}: ChoiceGroupProps<T>) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      <p className="hint">{hint}</p>
      <div className="choice-row">
        {options.map((option) => (
          <label
            key={option.id}
            className="choice-card"
            data-checked={value === option.id}
            data-testid={`choice-${name}-${option.id}`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => {
                onChange(option.id);
              }}
            />
            <span className="choice-title">
              <option.icon className="choice-icon" size={16} strokeWidth={2} aria-hidden="true" />
              {option.title}
            </span>
            <span className="choice-line">{option.line1}</span>
            {option.line2 ? <span className="choice-line">{option.line2}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StartPage({
  gate,
  onStart,
  settings,
  onSettingsChange,
  slots,
  saveMessage = null,
  onContinue,
  onDelete,
  onExport,
  onImport,
  onTestConnection,
}: StartPageProps) {
  const s = ui.shift.setup;
  const [rank, setRank] = useState<SetupRank>('MO');
  const [difficulty, setDifficulty] = useState<SetupDifficulty>('MEDIUM');
  const [mode, setMode] = useState<SetupMode>('NIGHT');
  const [ward, setWard] = useState<SetupWard>(WARDLIST[0]?.code ?? 'MED');
  const [draft, setDraft] = useState<Settings | null>(settings ?? null);
  const [test, setTest] = useState<
    { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; message: string; ok: boolean }
  >({ phase: 'idle' });

  const handleTest = async () => {
    if (!draft || !onTestConnection) return;
    const problems = validateSettings(draft);
    if (problems.length > 0) {
      setTest({ phase: 'done', message: ui.settings.testResult.invalidConfig, ok: false });
      return;
    }
    setTest({ phase: 'running' });
    const outcome = await onTestConnection(normalizeSettings(draft));
    setTest({ phase: 'done', ...describeOutcome(outcome) });
  };

  const summary = s.summary(
    s.rank[rank]?.name ?? rank,
    s.difficulty[difficulty]?.name ?? difficulty,
    s.modeCard[mode]?.name ?? mode,
    wardLabel(ward),
  );

  return (
    <section aria-labelledby="start-heading" className="page setup">
      <header className="setup-bar">
        <div className="setup-title">
          <h1 id="start-heading">{ui.start.heading}</h1>
          <p className="setup-tagline">{ui.start.tagline}</p>
          <p className="hint" id="setup-disclaimer">
            {ui.settings.disclaimer}
          </p>
        </div>
        <div className="setup-bar-actions">
          <p className="setup-summary" data-testid="setup-summary">
            {summary}
          </p>
          <button
            type="button"
            className="primary"
            disabled={!gate.canStart}
            onClick={() => {
              if (gate.canStart) onStart({ rank, difficulty, mode, ward });
            }}
          >
            {ui.start.startButton}
          </button>
        </div>
      </header>
      <div className="setup-grid">
        <div className="soft-panel setup-main">
          <ChoiceGroup
            name="rank"
            legend={`① ${s.rankHeading}`}
            hint={s.rankHint}
            value={rank}
            onChange={setRank}
            options={RANKS.map((id) => ({
              id,
              title: s.rank[id]?.name ?? id,
              line1: s.rank[id]?.sub ?? '',
              line2: s.rank[id]?.desc,
              icon: id === 'HO' ? CircleUserRound : id === 'MO' ? Users : Stethoscope,
            }))}
          />
          <ChoiceGroup
            name="difficulty"
            legend={`② ${s.difficultyHeading}`}
            hint={s.difficultyHint}
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES.map((id) => ({
              id,
              title: s.difficulty[id]?.name ?? id,
              line1: s.difficulty[id]?.desc ?? '',
              icon: id === 'EASY' ? ShieldCheck : id === 'MEDIUM' ? Gauge : CircleAlert,
            }))}
          />
          <ChoiceGroup
            name="ward"
            legend={`③ ${s.wardHeading}`}
            hint={s.wardHint}
            value={ward}
            onChange={setWard}
            options={WARDLIST.map((def) => ({
              id: def.code,
              title: def.zh,
              line1: def.en,
              line2: def.code,
              icon: def.code === 'SRG' ? Scissors : BedDouble,
            }))}
          />
          <ChoiceGroup
            name="mode"
            legend={`④ ${s.modeHeading}`}
            hint={s.modeHint}
            value={mode}
            onChange={setMode}
            options={MODES.map((id) => ({
              id,
              title: s.modeCard[id]?.name ?? id,
              line1: s.modeCard[id]?.time ?? '',
              line2: s.modeCard[id]?.desc,
              icon: id === 'DAY' ? Sun : id === 'NIGHT' ? Moon : AlarmClock,
            }))}
          />
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 可捲動設定要俾鍵盤聚焦 */}
        <aside className="setup-side" aria-label={s.apiHeading} tabIndex={0}>
          {draft ? (
            <div className="soft-panel setup-api">
              <h2 className="setup-api-title">{`⑤ ${s.apiHeading}`}</h2>
              {onTestConnection ? (
                <div className="setup-test">
                  <button
                    type="button"
                    data-testid="setup-test-connection"
                    disabled={test.phase === 'running'}
                    onClick={() => {
                      void handleTest();
                    }}
                  >
                    {test.phase === 'running' ? ui.settings.testing : ui.settings.testConnection}
                  </button>
                  {test.phase === 'done' ? (
                    <p
                      className={`notice ${test.ok ? 'notice-ok' : 'notice-error'}`}
                      data-testid="connection-result"
                      data-ok={test.ok}
                    >
                      {test.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="setup-api-fields">
                <AiSettingsFields
                  draft={draft}
                  idPrefix="setup"
                  includeNurseConfirm
                  onChange={(next) => {
                    setDraft(next);
                    onSettingsChange?.(next);
                    setTest({ phase: 'idle' });
                  }}
                />
              </div>
            </div>
          ) : null}
        </aside>
      </div>
      {slots && onContinue && onDelete && onExport && onImport ? (
        <SaveLibrary
          slots={slots}
          message={saveMessage}
          onContinue={onContinue}
          onDelete={onDelete}
          onExport={onExport}
          onImport={onImport}
        />
      ) : null}
    </section>
  );
}
