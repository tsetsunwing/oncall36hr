import { useState } from 'react';
import { ui } from '@/i18n';
import type { Settings } from '@/storage';
import type { StartGate } from '@/view';

export type SetupRank = 'HO' | 'MO' | 'RES';
export type SetupDifficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type SetupMode = 'DAY' | 'NIGHT' | 'ONCALL';

export interface StartChoice {
  rank: SetupRank;
  difficulty: SetupDifficulty;
  mode: SetupMode;
}

export interface StartPageProps {
  gate: StartGate;
  onStart: (choice: StartChoice) => void;
  settings?: Settings;
  onSettingsChange?: (settings: Settings) => void;
}

const missingMessage = {
  apiKey: ui.start.blockedMissingKey,
  baseUrl: ui.start.blockedMissingBaseUrl,
  model: ui.start.blockedMissingModel,
} as const;

const RANKS: readonly SetupRank[] = ['HO', 'MO', 'RES'];
const DIFFICULTIES: readonly SetupDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];
const MODES: readonly SetupMode[] = ['DAY', 'NIGHT', 'ONCALL'];

interface ChoiceGroupProps<T extends string> {
  name: string;
  legend: string;
  hint: string;
  value: T;
  options: readonly { id: T; title: string; line1: string; line2?: string | undefined }[];
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
            <span className="choice-title">{option.title}</span>
            <span className="choice-line">{option.line1}</span>
            {option.line2 ? <span className="choice-line">{option.line2}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function StartPage({ gate, onStart, settings, onSettingsChange }: StartPageProps) {
  const s = ui.shift.setup;
  const [rank, setRank] = useState<SetupRank>('MO');
  const [difficulty, setDifficulty] = useState<SetupDifficulty>('MEDIUM');
  const [mode, setMode] = useState<SetupMode>('NIGHT');
  const [draft, setDraft] = useState<Settings | null>(settings ?? null);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (!draft) return;
    const next = { ...draft, [key]: value };
    setDraft(next);
    onSettingsChange?.(next);
  }

  const summary = s.summary(
    s.rank[rank]?.name ?? rank,
    s.difficulty[difficulty]?.name ?? difficulty,
    s.modeCard[mode]?.name ?? mode,
  );

  return (
    <section aria-labelledby="start-heading" className="page setup">
      <h1 id="start-heading">{ui.start.heading}</h1>
      <p>{ui.start.tagline}</p>
      <div className="setup-grid">
        <div className="setup-main">
          <ChoiceGroup
            name="rank"
            legend={s.rankHeading}
            hint={s.rankHint}
            value={rank}
            onChange={setRank}
            options={RANKS.map((id) => ({
              id,
              title: s.rank[id]?.name ?? id,
              line1: s.rank[id]?.sub ?? '',
              line2: s.rank[id]?.desc,
            }))}
          />
          <ChoiceGroup
            name="difficulty"
            legend={s.difficultyHeading}
            hint={s.difficultyHint}
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTIES.map((id) => ({
              id,
              title: s.difficulty[id]?.name ?? id,
              line1: s.difficulty[id]?.desc ?? '',
            }))}
          />
          <ChoiceGroup
            name="mode"
            legend={s.modeHeading}
            hint={s.modeHint}
            value={mode}
            onChange={setMode}
            options={MODES.map((id) => ({
              id,
              title: s.modeCard[id]?.name ?? id,
              line1: s.modeCard[id]?.time ?? '',
              line2: s.modeCard[id]?.desc,
            }))}
          />
          <p className="setup-summary" data-testid="setup-summary">
            {summary}
          </p>
          {gate.canStart ? (
            <button
              type="button"
              className="primary"
              onClick={() => {
                onStart({ rank, difficulty, mode });
              }}
            >
              {ui.start.startButton}
            </button>
          ) : null}
        </div>
        <aside className="setup-side" aria-label={s.apiHeading}>
          {draft ? (
            <fieldset className="setup-api">
              <legend>{s.apiHeading}</legend>
              <div className="field">
                <label htmlFor="setup-base-url">{ui.settings.baseUrlLabel}</label>
                <input
                  id="setup-base-url"
                  type="url"
                  value={draft.baseUrl}
                  onChange={(e) => {
                    update('baseUrl', e.target.value);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="setup-api-key">{ui.settings.apiKeyLabel}</label>
                <input
                  id="setup-api-key"
                  type="password"
                  autoComplete="off"
                  value={draft.apiKey}
                  onChange={(e) => {
                    update('apiKey', e.target.value);
                  }}
                />
                <p className="hint">{ui.settings.apiKeyHint}</p>
              </div>
              <div className="field">
                <label htmlFor="setup-model">{ui.settings.modelLabel}</label>
                <input
                  id="setup-model"
                  type="text"
                  value={draft.model}
                  onChange={(e) => {
                    update('model', e.target.value);
                  }}
                />
              </div>
            </fieldset>
          ) : null}
          {gate.canStart ? null : (
            <div className="notice notice-blocked" data-testid="start-blocked">
              <h2>{ui.start.blockedTitle}</h2>
              <ul>
                {gate.missing.map((field) => (
                  <li key={field}>{missingMessage[field]}</li>
                ))}
              </ul>
              <button type="button" className="primary" disabled>
                {ui.start.startButton}
              </button>{' '}
              <a className="button-link" href="#/settings">
                {ui.start.settingsLink}
              </a>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
