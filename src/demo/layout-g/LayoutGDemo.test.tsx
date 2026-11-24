import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LayoutGDemo } from './LayoutGDemo';

describe('LayoutGDemo', () => {
  it('hosts Figma MCP token vars on the demo root', () => {
    render(<LayoutGDemo />);
    const root = screen.getByTestId('layout-g-demo');
    expect(root).toHaveAttribute('data-tokens', 'figma-mcp');
    expect(root.style.getPropertyValue('--g-teal')).toBe('#0d7380');
    expect(root.style.getPropertyValue('--g-dock-resus')).toBe('#eb4747');
    expect(root.style.getPropertyValue('--mon-green')).toBe('#33d973');
  });

  it('walks start → floor → bed zoom and keeps dock chips', async () => {
    const user = userEvent.setup();
    render(<LayoutGDemo />);
    expect(screen.getByTestId('lg-start')).toBeInTheDocument();
    await user.click(screen.getByTestId('lg-start-go'));
    expect(screen.getByTestId('lg-floor')).toBeInTheDocument();
    await user.click(screen.getByTestId('lg-bed-A5'));
    expect(screen.getByTestId('lg-bedzoom')).toBeInTheDocument();
    expect(screen.getByTestId('lg-chip-observe')).toBeInTheDocument();
    expect(screen.getByTestId('lg-chip-treat')).toBeInTheDocument();
    expect(screen.getByTestId('lg-chip-tests')).toBeInTheDocument();
    expect(screen.getByTestId('lg-chip-resus')).toBeInTheDocument();
    expect(screen.getByTestId('lg-chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('monitor')).toBeInTheDocument();
  });

  it('opens landmarks without a bottom dock, and phone overlay', async () => {
    const user = userEvent.setup();
    render(<LayoutGDemo />);
    await user.click(screen.getByTestId('lg-start-go'));
    await user.click(screen.getByTestId('lg-landmark-pantry'));
    expect(screen.getByTestId('lg-landmark-screen-pantry')).toBeInTheDocument();
    expect(screen.queryByTestId('lg-dock')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('lg-landmark-back'));
    expect(screen.getByTestId('lg-floor')).toBeInTheDocument();
    await user.click(screen.getByTestId('lg-phone'));
    expect(screen.getByTestId('lg-phone-screen')).toBeInTheDocument();
    await user.click(screen.getByTestId('lg-phone-contact-chan'));
    expect(screen.getByText(/SpO₂ 92%/)).toBeInTheDocument();
  });

  it('opens observe panel from dock using production ObservePanel', async () => {
    const user = userEvent.setup();
    render(<LayoutGDemo />);
    await user.click(screen.getByTestId('lg-start-go'));
    await user.click(screen.getByTestId('lg-bed-A5'));
    await user.click(screen.getByTestId('lg-chip-observe'));
    expect(screen.getByTestId('observe-panel')).toBeInTheDocument();
  });

  it('rebuilds setup / treat P2 / round from Figma AL nodes', async () => {
    const user = userEvent.setup();
    render(<LayoutGDemo />);
    await user.click(screen.getByTestId('lg-start-new'));
    expect(screen.getByTestId('lg-setup')).toHaveAttribute('data-node-id', '159:517');
    await user.click(screen.getByTestId('lg-setup-start'));
    expect(screen.getByTestId('lg-floor')).toBeInTheDocument();
    await user.click(screen.getByTestId('lg-bed-A5'));
    await user.click(screen.getByTestId('lg-chip-treat'));
    expect(screen.getByTestId('lg-treat-p2')).toHaveAttribute('data-node-id', '132:545');
    await user.click(screen.getByTestId('lg-treat-oxygen'));
    expect(screen.getByTestId('oxygen-order')).toBeInTheDocument();
    await user.click(screen.getByTestId('lg-back'));
    await user.click(screen.getByTestId('lg-round'));
    expect(screen.getByTestId('lg-round-screen')).toHaveAttribute('data-node-id', '161:517');
    await user.click(screen.getByRole('button', { name: /床邊 ECG/ }));
    await user.click(screen.getByTestId('lg-round-submit'));
    expect(screen.getByTestId('lg-round-feedback')).toHaveAttribute('data-node-id', '161:566');
  });

  it('opens Figma end grade report', async () => {
    const user = userEvent.setup();
    render(<LayoutGDemo />);
    await user.click(screen.getByTestId('lg-start-end'));
    expect(screen.getByTestId('lg-end')).toHaveAttribute('data-node-id', '136:583');
    expect(screen.getByText('交更成績表 Shift Report')).toBeInTheDocument();
  });
});
