import { useSyncExternalStore } from 'react';

export type Route = 'start' | 'settings' | 'game';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  if (path === '/settings') return 'settings';
  if (path === '/game') return 'game';
  return 'start';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function navigate(route: Route): void {
  window.location.hash = route === 'start' ? '#/' : `#/${route}`;
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
