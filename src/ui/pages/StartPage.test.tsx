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

  it('tests the connection from the setup AI panel', async () => {
    const onTestConnection = vi.fn().mockResolvedValue({ kind: 'ok', jsonMode: true });
    render(
      <StartPage
        gate={{ canStart: true }}
        onStart={vi.fn()}
        settings={{
          provider: 'grok',
          baseUrl: 'https://api.x.ai/v1',
          apiKey: 'test-key',
          model: 'grok-4.7',
          thinkingLevel: 'low',
          nurseConfirmHighRisk: true,
        }}
        onTestConnection={onTestConnection}
      />,
    );
    await userEvent.click(screen.getByTestId('setup-test-connection'));
    expect(await screen.findByTestId('connection-result')).toHaveAttribute('data-ok', 'true');
    expect(onTestConnection).toHaveBeenCalledOnce();
  });

  it('starts when the gate is open', async () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: true }} onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: ui.start.startButton }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
