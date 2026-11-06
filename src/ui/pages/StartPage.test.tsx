import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import { StartPage } from './StartPage';

describe('StartPage', () => {
  it('blocks start and links to settings when the key is missing', () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: false, missing: ['apiKey'] }} onStart={onStart} />);
    expect(screen.getByTestId('start-blocked')).toHaveTextContent(ui.start.blockedMissingKey);
    expect(screen.getByRole('button', { name: ui.start.startButton })).toBeDisabled();
    expect(screen.getByRole('link', { name: ui.start.settingsLink })).toHaveAttribute(
      'href',
      '#/settings',
    );
    expect(onStart).not.toHaveBeenCalled();
  });

  it('starts when the gate is open', async () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: true }} onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: ui.start.startButton }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
