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
    const fields =
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? (payload as { patientId?: unknown; step?: unknown })
        : {};
    const patientId = typeof fields.patientId === 'string' ? fields.patientId : undefined;
    const step = fields.step;
    if (patientId === undefined || !isDeathStep(step)) return { state, effects: [] };
    const viaPhone = step === 'NOTIFY_SENIOR' || step === 'PHONE_FAMILY';
    if (viaPhone && state.ward.enabled) {
      return { state, effects: [{ type: 'NOTICE', kind: 'DEATH_STEP_VIA_PHONE', tone: 'warn' }] };
    }
    return completeDeathStep(state, patientId, step);
  },

  handleScheduled(state, event, ctx) {
    if (event.kind !== DEATH_DELAY_EVENT) return undefined;
    const payload = event.payload;
    const patientId =
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? (payload as { patientId?: unknown }).patientId
        : undefined;
    if (typeof patientId !== 'string') return { state, effects: [] };
    return handleDeathDelay(state, patientId, ctx, event.time);
  },
};
