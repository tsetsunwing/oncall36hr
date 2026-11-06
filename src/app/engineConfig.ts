import { getConfig } from '@/content';
import type { EngineConfig } from '@/engine';

export function getEngineConfig(): EngineConfig {
  return getConfig();
}
