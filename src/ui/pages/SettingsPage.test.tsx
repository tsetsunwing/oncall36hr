import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import { defaultSettings } from '@/storage';
import { SettingsPage, type ConnectionOutcome } from './SettingsPage';

const setup = (outcome: ConnectionOutcome = { kind: 'ok', jsonMode: true }) => {
  const onSave = vi.fn();
  const onTestConnection = vi.fn().mockResolvedValue(outcome);
  render(
    <SettingsPage
      initial={defaultSettings()}
      onSave={onSave}
      onTestConnection={onTestConnection}
    />,
  );
  return { onSave, onTestConnection, user: userEvent.setup() };
};

describe('SettingsPage', () => {
  it('shows defaults, privacy line and disclaimer', () => {
    setup();
    expect(screen.getByLabelText(ui.settings.baseUrlLabel)).toHaveValue(
      'https://api.openai.com/v1',
    );
    expect(screen.getByLabelText(ui.settings.apiKeyLabel)).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('privacy-line')).toHaveTextContent('存檔留在瀏覽器');
    expect(screen.getByText(ui.settings.disclaimer)).toBeInTheDocument();
  });

  it('saves normalised values', async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText(ui.settings.apiKeyLabel), '  sk-123 ');
    await user.click(screen.getByRole('button', { name: ui.settings.save }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-123' }));
    expect(screen.getByTestId('settings-notice')).toHaveTextContent(ui.settings.saved);
  });

  it('shows validation errors for an empty key', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: ui.settings.save }));
    expect(screen.getByText(ui.settings.validation.apiKey)).toBeInTheDocument();
    expect(screen.getByLabelText(ui.settings.apiKeyLabel)).toHaveAttribute('aria-invalid', 'true');
  });

  it('toggles key visibility', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText(ui.settings.showKey));
    expect(screen.getByLabelText(ui.settings.apiKeyLabel)).toHaveAttribute('type', 'text');
  });

  it('refuses to test an incomplete config without calling the network', async () => {
    const { onTestConnection, user } = setup();
    await user.click(screen.getByRole('button', { name: ui.settings.testConnection }));
    expect(onTestConnection).not.toHaveBeenCalled();
    expect(screen.getByTestId('connection-result')).toHaveTextContent(
      ui.settings.testResult.invalidConfig,
    );
  });

  it('runs the connection test with the draft values and reports success', async () => {
    const { onTestConnection, user } = setup();
    await user.type(screen.getByLabelText(ui.settings.apiKeyLabel), 'sk-abc');
    await user.click(screen.getByRole('button', { name: ui.settings.testConnection }));
    await waitFor(() => {
      expect(screen.getByTestId('connection-result')).toHaveAttribute('data-ok', 'true');
    });
    expect(onTestConnection).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-abc' }));
    expect(screen.getByTestId('connection-result')).toHaveTextContent(ui.settings.testResult.ok);
  });

  it.each([
    [{ kind: 'auth', status: 401 } as const, ui.settings.testResult.auth],
    [{ kind: 'network' } as const, ui.settings.testResult.network],
    [{ kind: 'timeout' } as const, ui.settings.testResult.timeout],
    [{ kind: 'http', status: 500 } as const, `${ui.settings.testResult.http}500`],
    [{ kind: 'format' } as const, ui.settings.testResult.format],
  ])('reports failure %j', async (outcome, text) => {
    const { user } = setup(outcome);
    await user.type(screen.getByLabelText(ui.settings.apiKeyLabel), 'sk-abc');
    await user.click(screen.getByRole('button', { name: ui.settings.testConnection }));
    const result = await screen.findByTestId('connection-result');
    expect(result).toHaveAttribute('data-ok', 'false');
    expect(result).toHaveTextContent(text);
  });
});
