import type { EngineTables } from '@/engine';
import type { ShiftClockConfig } from './clock';
import type { GameView } from './types';

export interface ViewEnv {
  tables: EngineTables;
  config: ShiftClockConfig & {
    clock: { speeds: readonly number[] };
    chat: { playerTextMaxChars: number };
    gate: { pharmacyName: string };
    phone: { sbarMaxChars: number; transcriptLimit: number };
    staff: { rankImpression: { start: number } };
    ui: { monitor: { sweepSeconds: number; targetFps: number } };
  };
  aiFailureReason?: string | null;
  notice?: GameView['notice'];
}
