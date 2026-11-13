import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LayoutCDemo } from './LayoutCDemo';

describe('LayoutCDemo', () => {
  it('walks start → floor → bedside and keeps order chips', async () => {
    const user = userEvent.setup();
    render(<LayoutCDemo />);
    expect(screen.getByTestId('lc-start')).toBeInTheDocument();
    await user.click(screen.getByTestId('lc-start-go'));
    expect(screen.getByTestId('lc-floor')).toBeInTheDocument();
    await user.click(screen.getByTestId('lc-bed-3'));
    expect(screen.getByTestId('lc-bedside')).toBeInTheDocument();
    expect(screen.getByTestId('lc-chip-觀察')).toBeInTheDocument();
    expect(screen.getByTestId('lc-chip-治療')).toBeInTheDocument();
    expect(screen.getByTestId('lc-chip-檢查')).toBeInTheDocument();
    expect(screen.getByTestId('lc-chip-搶救')).toBeInTheDocument();
    expect(screen.getByTestId('lc-chat-input')).toBeInTheDocument();
  });

  it('opens landmarks and phone drawer without leaving the demo shell', async () => {
    const user = userEvent.setup();
    render(<LayoutCDemo />);
    await user.click(screen.getByTestId('lc-start-go'));
    await user.click(screen.getByTestId('lc-place-pantry'));
    expect(screen.getByTestId('lc-landmark-PANTRY')).toBeInTheDocument();
    await user.click(screen.getByTestId('lc-back-ward'));
    expect(screen.getByTestId('lc-floor')).toBeInTheDocument();
    await user.click(screen.getByTestId('lc-open-phone'));
    expect(screen.getByTestId('lc-phone-drawer')).toBeInTheDocument();
  });
});
