import type { EngineModule } from '../core/module';
import { ACLS_CYCLE_EVENT, ACLS_POSTROSC_EVENT, handleCycleDue, handlePostRoscEnd } from './arrest';

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
      const episode = numberField(event.payload, 'episode');
      const startedAt = numberField(event.payload, 'startedAt');
      if (episode === undefined || startedAt === undefined) return { state, effects: [] };
      return handleCycleDue(state, { episode, startedAt }, ctx);
    }
    if (event.kind === ACLS_POSTROSC_EVENT) {
      const episode = numberField(event.payload, 'episode');
      if (episode === undefined) return { state, effects: [] };
      return handlePostRoscEnd(state, { episode }, ctx);
    }
    return undefined;
  },
};
