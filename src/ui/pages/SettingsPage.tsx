import { useState, type FormEvent } from 'react';
import { ui } from '@/i18n';
import {
  defaultSettings,
  normalizeSettings,
  validateSettings,
  type Settings,
  type SettingsField,
} from '@/storage';
import { AiSettingsFields } from './AiSettingsFields';

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

export function SettingsPage({ initial, onSave, onTestConnection }: SettingsPageProps) {
  const [draft, setDraft] = useState<Settings>(initial);
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

  return (
    <section aria-labelledby="settings-heading" className="page settings-page">
      <h1 id="settings-heading">{ui.settings.heading}</h1>
      <form onSubmit={handleSave} noValidate>
        <fieldset className="soft-panel">
          <legend>{ui.settings.aiSection}</legend>
          <AiSettingsFields
            draft={draft}
            invalid={invalid}
            onChange={(next) => {
              setDraft(next);
              setNotice(null);
            }}
          />
        </fieldset>

        <fieldset className="soft-panel">
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

      <section className="soft-panel" aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading">{ui.settings.shortcutsHeading}</h2>
        <table className="shortcut-table" data-testid="shortcut-table">
          <caption className="visually-hidden">{ui.settings.shortcutsHeading}</caption>
          <thead>
            <tr>
              <th scope="col">{ui.settings.shortcutKey}</th>
              <th scope="col">{ui.settings.shortcutAction}</th>
            </tr>
          </thead>
          <tbody>
            {ui.settings.shortcutRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <kbd>{row.keys}</kbd>
                </td>
                <td>{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="soft-panel" aria-labelledby="disclaimer-heading">
        <h2 id="disclaimer-heading">{ui.settings.disclaimerHeading}</h2>
        <p>{ui.settings.disclaimer}</p>
        <p data-testid="privacy-line">{ui.settings.privacy}</p>
      </section>
    </section>
  );
}
