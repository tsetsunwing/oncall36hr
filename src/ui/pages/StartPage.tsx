import { ui } from '@/i18n';
import type { StartGate } from '@/view';

export interface StartPageProps {
  gate: StartGate;
  onStart: () => void;
}

const missingMessage = {
  apiKey: ui.start.blockedMissingKey,
  baseUrl: ui.start.blockedMissingBaseUrl,
  model: ui.start.blockedMissingModel,
} as const;

export function StartPage({ gate, onStart }: StartPageProps) {
  return (
    <section aria-labelledby="start-heading" className="page">
      <h1 id="start-heading">{ui.start.heading}</h1>
      <p>{ui.start.tagline}</p>
      {gate.canStart ? (
        <button type="button" className="primary" onClick={onStart}>
          {ui.start.startButton}
        </button>
      ) : (
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
    </section>
  );
}
