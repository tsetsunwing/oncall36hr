import { useSyncExternalStore } from 'react';

export type Route = 'start' | 'settings' | 'game' | 'demo-layout-c';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  if (path === '/settings') return 'settings';
  if (path === '/game') return 'game';
  if (path === '/demo/layout-c') return 'demo-layout-c';
  return 'start';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function navigateToGame(choice: {
  mode: string;
  difficulty: string;
  rank: string;
  ward: string;
}): void {
  const query = new URLSearchParams({
    mode: choice.mode,
    difficulty: choice.difficulty,
    rank: choice.rank,
    ward: choice.ward,
  });
  window.location.hash = `#/game?${query.toString()}`;
}

export function navigate(route: Route): void {
  if (route === 'start') {
    window.location.hash = '#/';
    return;
  }
  if (route === 'demo-layout-c') {
    window.location.hash = '#/demo/layout-c';
    return;
  }
  window.location.hash = `#/${route}`;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

/** `#/game?seed=abc`：測試同重現問題用嘅固定種子；冇就由 app 產生 */
export function hashParams(hash: string): URLSearchParams {
  const query = hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}
