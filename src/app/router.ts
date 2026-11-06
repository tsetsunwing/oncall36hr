import { useSyncExternalStore } from 'react';

export type Route = 'start' | 'settings' | 'game';

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
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
