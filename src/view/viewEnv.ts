import type { EngineTables, TimelineConfig } from '@/engine';
import type { ShiftClockConfig } from './clock';
import type { GameView } from './types';

export interface ViewEnv {
  tables: EngineTables;
  config: ShiftClockConfig &
    TimelineConfig & {
      clock: { speeds: readonly number[]; cprSlowFactor: number; pauseWhileAiPending: boolean };
      rounds: { questionSeconds: number };
      acls: { cycleSeconds: number; minCyclesBeforeStop: number };
      chat: { playerTextMaxChars: number };
      gate: { pharmacyName: string };
      phone: { sbarMaxChars: number; transcriptLimit: number };
      consult: { maxFollowups: number; followupMaxChars: number };
      family: { maxTurns: number };
      staff: { rankImpression: { start: number } };
      ui: { monitor: { sweepSeconds: number; targetFps: number } };
    };
  aiFailureReason?: string | null;
  aiFailureDetail?: string | null;
  notice?: GameView['notice'];
}
