import { useState, type FormEvent } from 'react';
import { ui } from '@/i18n';
import {
  defaultSettings,
  normalizeSettings,
  validateSettings,
  type Settings,
  type SettingsField,
} from '@/storage';

export type ConnectionOutcome =
  | { kind: 'ok'; jsonMode: boolean }
  | { kind: 'auth'; status: number }
  | { kind: 'http'; status: number }
  | { kind: 'format' }
  | { kind: 'timeout' }
  | { kind: 'network' };

export interface SettingsPageProps {
  initial: Settings;
  onSave: (settings: Settings) => void;
  onTestConnection: (settings: Settings) => Promise<ConnectionOutcome>;
}

type TestState =
  { phase: 'idle' } | { phase: 'running' } | { phase: 'done'; message: string; ok: boolean };

function describeOutcome(outcome: ConnectionOutcome): { message: string; ok: boolean } {
  const t = ui.settings.testResult;
  switch (outcome.kind) {
    case 'ok':
      return { message: outcome.jsonMode ? t.ok : t.okNonJson, ok: true };
    case 'auth':
      return { message: `${t.auth}（HTTP ${outcome.status}）`, ok: false };
    case 'http':
      return { message: `${t.http}${outcome.status}`, ok: false };
    case 'format':
      return { message: t.format, ok: false };
    case 'timeout':
      return { message: t.timeout, ok: false };
    case 'network':
      return { message: t.network, ok: false };
  }
}

const fieldMessage: Record<SettingsField, string> = {
  baseUrl: ui.settings.validation.baseUrl,
  apiKey: ui.settings.validation.apiKey,
  model: ui.settings.validation.model,
};

export function SettingsPage({ initial, onSave, onTestConnection }: SettingsPageProps) {
  const [draft, setDraft] = useState<Settings>(initial);
  const [showKey, setShowKey] = useState(false);
  const [invalid, setInvalid] = useState<SettingsField[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<TestState>({ phase: 'idle' });

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice(null);
  };

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    const problems = validateSettings(draft);
    setInvalid(problems);
    onSave(normalizeSettings(draft));
    setNotice(ui.settings.saved);
  };

  const handleTest = async () => {
    const problems = validateSettings(draft);
    setInvalid(problems);
    if (problems.length > 0) {
      setTest({ phase: 'done', message: ui.settings.testResult.invalidConfig, ok: false });
      return;
    }
    setTest({ phase: 'running' });
    const outcome = await onTestConnection(normalizeSettings(draft));
    setTest({ phase: 'done', ...describeOutcome(outcome) });
  };

  const handleReset = () => {
    setDraft(defaultSettings());
    setInvalid([]);
    setNotice(ui.settings.resetDone);
  };

  const errorId = (field: SettingsField) => `${field}-error`;
  const describedBy = (field: SettingsField, hintId: string) =>
    invalid.includes(field) ? `${hintId} ${errorId(field)}` : hintId;

  return (
    <section aria-labelledby="settings-heading" className="page">
      <h1 id="settings-heading">{ui.settings.heading}</h1>
      <form onSubmit={handleSave} noValidate>
        <fieldset>
          <legend>{ui.settings.aiSection}</legend>

          <div className="field">
            <label htmlFor="baseUrl">{ui.settings.baseUrlLabel}</label>
            <input
              id="baseUrl"
              name="baseUrl"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={draft.baseUrl}
              aria-invalid={invalid.includes('baseUrl')}
              aria-describedby={describedBy('baseUrl', 'baseUrl-hint')}
              onChange={(e) => update('baseUrl', e.target.value)}
            />
            <p id="baseUrl-hint" className="hint">
              {ui.settings.baseUrlHint}
            </p>
            {invalid.includes('baseUrl') && (
              <p id={errorId('baseUrl')} className="field-error">
                {fieldMessage.baseUrl}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="apiKey">{ui.settings.apiKeyLabel}</label>
            <input
              id="apiKey"
              name="apiKey"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={draft.apiKey}
              aria-invalid={invalid.includes('apiKey')}
              aria-describedby={describedBy('apiKey', 'apiKey-hint')}
              onChange={(e) => update('apiKey', e.target.value)}
            />
            <p id="apiKey-hint" className="hint">
              {ui.settings.apiKeyHint}
            </p>
            {invalid.includes('apiKey') && (
              <p id={errorId('apiKey')} className="field-error">
                {fieldMessage.apiKey}
              </p>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showKey}
                onChange={(e) => setShowKey(e.target.checked)}
              />
              {ui.settings.showKey}
            </label>
          </div>

          <div className="field">
            <label htmlFor="model">{ui.settings.modelLabel}</label>
            <input
              id="model"
              name="model"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={draft.model}
              aria-invalid={invalid.includes('model')}
              aria-describedby={describedBy('model', 'model-hint')}
              onChange={(e) => update('model', e.target.value)}
            />
            <p id="model-hint" className="hint">
              {ui.settings.modelHint}
            </p>
            {invalid.includes('model') && (
              <p id={errorId('model')} className="field-error">
                {fieldMessage.model}
              </p>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>{ui.settings.gameSection}</legend>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.nurseConfirmHighRisk}
              onChange={(e) => update('nurseConfirmHighRisk', e.target.checked)}
            />
            {ui.settings.nurseConfirmLabel}
          </label>
        </fieldset>

        <div className="actions">
          <button type="submit" className="primary">
            {ui.settings.save}
          </button>
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={test.phase === 'running'}
          >
            {test.phase === 'running' ? ui.settings.testing : ui.settings.testConnection}
          </button>
          <button type="button" onClick={handleReset}>
            {ui.settings.reset}
          </button>
        </div>

        {notice && (
          <p className="notice notice-info" data-testid="settings-notice">
            {notice}
          </p>
        )}
        {test.phase === 'done' && (
          <p
            className={`notice ${test.ok ? 'notice-ok' : 'notice-error'}`}
            data-testid="connection-result"
            data-ok={test.ok}
          >
            {test.message}
          </p>
        )}
      </form>

      <section aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading">{ui.settings.shortcutsHeading}</h2>
        <p>{ui.settings.shortcutsPending}</p>
      </section>

      <section aria-labelledby="disclaimer-heading">
        <h2 id="disclaimer-heading">{ui.settings.disclaimerHeading}</h2>
        <p>{ui.settings.disclaimer}</p>
        <p data-testid="privacy-line">{ui.settings.privacy}</p>
      </section>
    </section>
  );
}
