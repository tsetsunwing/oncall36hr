import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ui } from '@/i18n';
import { SETTINGS_STORAGE_KEY } from '@/storage';
import { App } from './App';

beforeEach(() => {
  window.location.hash = '#/';
});
afterEach(() => {
  window.location.hash = '';
});

describe('App (M0 gate)', () => {
  it('blocks the game without a key, even when navigating straight to #/game', async () => {
    window.location.hash = '#/game';
    render(<App />);
    expect(await screen.findByTestId('start-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('game-placeholder')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
    });
  });

  it('lets the player start after saving a key in settings', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: ui.nav.settings }));
    await user.type(await screen.findByLabelText(ui.settings.apiKeyLabel), 'sk-live');
    await user.click(screen.getByRole('button', { name: ui.settings.save }));
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({
      apiKey: 'sk-live',
    });

    await user.click(screen.getByRole('link', { name: ui.nav.start }));
    await user.click(await screen.findByRole('button', { name: ui.start.startButton }));
    expect(await screen.findByTestId('game-placeholder')).toBeInTheDocument();
  });

  it('starts directly when a key was already stored', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ apiKey: 'stored' }));
    render(<App />);
    expect(screen.queryByTestId('start-blocked')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ui.start.startButton })).toBeEnabled();
  });
});
