import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayFrame } from './PlayFrame';

function stubMedia(mobile: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: mobile && query.includes('orientation: portrait'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PlayFrame', () => {
  it('lets the desktop stage follow the window instead of locking 1280×800', () => {
    stubMedia(false);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1920 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1080 });
    render(
      <PlayFrame>
        <p>開始</p>
      </PlayFrame>,
    );
    const stage = screen.getByTestId('play-frame');
    expect(stage).toHaveAttribute('data-frame', 'desktop');
    expect(stage).toHaveClass('frame-desktop');
    expect(stage).not.toHaveStyle({ width: '1280px', height: '800px' });
    expect(stage.style.zoom).toBe('');
  });

  it('keeps the portrait phone frame at 390×844', () => {
    stubMedia(true);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    render(
      <PlayFrame>
        <p>開始</p>
      </PlayFrame>,
    );
    const stage = screen.getByTestId('play-frame');
    expect(stage).toHaveAttribute('data-frame', 'mobile');
    expect(stage).toHaveStyle({ width: '390px', height: '844px' });
  });
});
