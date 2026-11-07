import type { ReactNode } from 'react';
import { ui } from '@/i18n';
import { PlayFrame } from '../frame/PlayFrame';

export interface LayoutProps {
  current: 'start' | 'settings' | 'game';
  children: ReactNode;
}

export function Layout({ current, children }: LayoutProps) {
  return (
    <PlayFrame>
      <div className="app-shell">
        <header className="app-header">
          <span className="app-title">{ui.appTitle}</span>
          <nav aria-label={ui.nav.label}>
            <a href="#/" aria-current={current === 'start' ? 'page' : undefined}>
              {ui.nav.start}
            </a>
            <a href="#/settings" aria-current={current === 'settings' ? 'page' : undefined}>
              {ui.nav.settings}
            </a>
          </nav>
        </header>
        <main className={current === 'game' ? 'wide' : undefined}>{children}</main>
      </div>
    </PlayFrame>
  );
}
