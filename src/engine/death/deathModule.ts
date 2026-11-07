import type { EngineModule } from '../core/module';
import { completeDeathStep, DEATH_DELAY_EVENT, handleDeathDelay, isDeathStep } from './death';

export const DEATH_MODULE = 'death';
export const COMPLETE_STEP_INTENT = 'COMPLETE_STEP';

export const deathModule: EngineModule = {
  name: DEATH_MODULE,

  handleIntent(state, intent) {
    if (intent.type !== 'EXTENSION' || intent.module !== DEATH_MODULE) return undefined;
    if (intent.name !== COMPLETE_STEP_INTENT) return undefined;
    const payload = intent.payload;
    const step =
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? payload.step
        : undefined;
    if (!isDeathStep(step)) return { state, effects: [] };
    return completeDeathStep(state, step);
  },

  handleScheduled(state, event, ctx) {
    if (event.kind !== DEATH_DELAY_EVENT) return undefined;
    return handleDeathDelay(state, ctx, event.time);
  },
};
