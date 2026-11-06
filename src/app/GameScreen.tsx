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
          mode: 'NIGHT',
          difficulty: 'MEDIUM',
          playerRank: 'MO',
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
