import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '@/i18n';
import type { SaveSlotView } from '@/storage';
import { SaveLibrary } from './SaveLibrary';

const slot = (over: Partial<SaveSlotView> = {}): SaveSlotView => ({
  id: 'manual-1',
  kind: 'MANUAL',
  status: 'OK',
  meta: {
    id: 'manual-1',
    kind: 'MANUAL',
    savedAt: '2026-11-07T01:02:00.000Z',
    summary: { mode: 'NIGHT', gameTime: 60, difficulty: 'MEDIUM', rank: 'MO', patientsActive: 3 },
    schema: 8,
    appVersion: '0.0.0',
    bytes: 10,
  },
  ...over,
});

describe('SaveLibrary', () => {
  it('continues, confirms delete, and shows a migration failure without a continue button', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const onDelete = vi.fn();
    render(
      <SaveLibrary
        slots={[slot(), slot({ id: 'manual-2', status: 'CORRUPT', meta: null })]}
        message={ui.saves.errors.SCHEMA_TOO_NEW ?? null}
        onContinue={onContinue}
        onDelete={onDelete}
        onExport={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByTestId('save-message')).toHaveTextContent('原槽未覆寫');
    expect(screen.getByTestId('continue-manual-2')).toBeDisabled();
    await user.click(screen.getByTestId('continue-manual-1'));
    expect(onContinue).toHaveBeenCalledWith('manual-1');
    await user.click(screen.getByTestId('delete-manual-1'));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('confirm-delete-manual-1'));
    expect(onDelete).toHaveBeenCalledWith('manual-1');
  });
});
