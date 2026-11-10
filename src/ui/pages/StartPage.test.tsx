import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import { StartPage } from './StartPage';

describe('StartPage', () => {
  it('keeps start disabled when the key is missing', () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: false, missing: ['apiKey'] }} onStart={onStart} />);
    expect(screen.queryByTestId('start-blocked')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: ui.start.startButton })).toBeDisabled();
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

  it('lets the player cover a surgical or specialty ward', async () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: true }} onStart={onStart} />);
    expect(screen.getByTestId('setup-tagline')).toHaveTextContent(
      '你是內科病房的值班醫生。今晚，病房只有你一人。',
    );
    await userEvent.selectOptions(screen.getByTestId('setup-ward'), 'SURGERY');
    expect(screen.getByTestId('setup-tagline')).toHaveTextContent(
      '你是外科病房的值班醫生。今晚，病房只有你一人。',
    );
    await userEvent.selectOptions(screen.getByTestId('setup-ward'), 'CARDIOLOGY');
    expect(screen.getByTestId('setup-tagline')).toHaveTextContent(
      '你是 Cardiology 病房的值班醫生。今晚，病房只有你一人。',
    );
    expect(screen.getByTestId('setup-ward')).not.toHaveTextContent('Pharmacy');
    await userEvent.click(screen.getByRole('button', { name: ui.start.startButton }));
    expect(onStart).toHaveBeenCalledWith({
      rank: 'MO',
      difficulty: 'MEDIUM',
      mode: 'NIGHT',
      home: { kind: 'SPECIALTY', deptId: 'CARDIOLOGY' },
    });
  });

  it('starts when the gate is open', async () => {
    const onStart = vi.fn();
    render(<StartPage gate={{ canStart: true }} onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: ui.start.startButton }));
    expect(onStart).toHaveBeenCalledOnce();
  });
});
