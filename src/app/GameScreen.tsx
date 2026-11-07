import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createAiGateway, type DevProxy } from '@/ai';
import { getConfig, getContent } from '@/content';
import type { Settings } from '@/storage';
import { GamePage } from '@/ui';
import { createGameSession, type GameSession } from './gameSession';
import { createLazySaveService } from './lazySaves';
import { hashParams } from './router';

export interface GameScreenProps {
  settings: Settings;
  devProxy?: DevProxy | undefined;
}

const MODES = ['DAY', 'NIGHT', 'ONCALL'] as const;
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
const RANKS = ['HO', 'MO', 'RES'] as const;

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** 開局選項（hash 參數，供測試與預覽用）：mode／difficulty／rank；ward=single 為舊式單一病人 */
function pickParams() {
  const params = hashParams(window.location.hash);
  return {
    mode: pick(params.get('mode'), MODES, 'NIGHT'),
    difficulty: pick(params.get('difficulty'), DIFFICULTIES, 'MEDIUM'),
    playerRank: pick(params.get('rank'), RANKS, 'MO'),
    ward: params.get('ward') !== 'single',
  };
}

function pickSeed(): string {
  const fromUrl = hashParams(window.location.hash).get('seed');
  return fromUrl && fromUrl.length > 0 ? fromUrl : `night-${String(Date.now())}`;
}

export function GameScreen({ settings, devProxy }: GameScreenProps) {
  const session: GameSession = useMemo(
    () =>
      createGameSession({
        config: getConfig(),
        tables: getContent().tables,
        params: {
          seed: pickSeed(),
          ...pickParams(),
          nurseConfirmHighRisk: settings.nurseConfirmHighRisk,
        },
        gateway: createAiGateway(settings, devProxy ? { proxy: devProxy } : {}),
        saves: createLazySaveService(),
        onSaveError: () => undefined,
      }),
    // 一局遊戲只喺進入畫面時建立；中途改設定唔會換局
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    session.start();
    return () => {
      session.stop();
    };
  }, [session]);

  const view = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <GamePage view={view} actions={session.actions} />;
}
