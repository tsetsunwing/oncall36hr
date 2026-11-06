import { dialogueTemplate, ui } from '@/i18n';

export function GamePage() {
  return (
    <section aria-labelledby="game-heading" className="page">
      <h1 id="game-heading">{ui.game.heading}</h1>
      <p data-testid="game-placeholder">{ui.game.placeholder}</p>
      <blockquote lang="yue-Hant-HK">{dialogueTemplate('nurse.greeting')}</blockquote>
      <a className="button-link" href="#/">
        {ui.game.backToStart}
      </a>
    </section>
  );
}
