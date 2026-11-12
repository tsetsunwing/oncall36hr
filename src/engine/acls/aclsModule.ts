import type { EngineModule } from '../core/module';
import { ACLS_CYCLE_EVENT, ACLS_POSTROSC_EVENT, handleCycleDue, handlePostRoscEnd } from './arrest';

function stringField(payload: unknown, key: string): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(payload: unknown, key: string): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/** 搶救定時事件：CPR cycle 到期提示、ROSC 觀察窗結束。ROSC 本身只喺 order 完成時由 arrest.ts 判定。 */
export const aclsModule: EngineModule = {
  name: 'acls',

  handleScheduled(state, event, ctx) {
    if (event.kind === ACLS_CYCLE_EVENT) {
      const patientId = stringField(event.payload, 'patientId');
      const episode = numberField(event.payload, 'episode');
      const startedAt = numberField(event.payload, 'startedAt');
      if (patientId === undefined || episode === undefined || startedAt === undefined)
        return { state, effects: [] };
      return handleCycleDue(state, { patientId, episode, startedAt }, ctx);
    }
    if (event.kind === ACLS_POSTROSC_EVENT) {
      const patientId = stringField(event.payload, 'patientId');
      const episode = numberField(event.payload, 'episode');
      if (patientId === undefined || episode === undefined) return { state, effects: [] };
      return handlePostRoscEnd(state, { patientId, episode }, ctx);
    }
    return undefined;
  },
};
