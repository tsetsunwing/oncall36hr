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

/** callrate=每小時來電基數（測試與預覽用，上限 120）；不設則用內容設定 */
function pickConfig() {
  const config = getConfig();
  const raw = Number(hashParams(window.location.hash).get('callrate'));
  if (!Number.isFinite(raw) || raw <= 0) return config;
  return {
    ...config,
    phone: { ...config.phone, baseCallsPerHour: Math.min(Math.round(raw), 120) },
  };
}

function pickSeed(): string {
  const fromUrl = hashParams(window.location.hash).get('seed');
  return fromUrl && fromUrl.length > 0 ? fromUrl : `night-${String(Date.now())}`;
}

/** 開發／測試用：`#/game?case=<template id>` 指定單一病人病例（未知 id 忽略；指定病例時強制單一病人模式）；`#/game?wardcase=<id>` 則病房模式內有一個病人用該模板 */
function pickCase():
  { caseId: string; ward: false } | { wardCaseId: string } | Record<string, never> {
  const params = hashParams(window.location.hash);
  const templates = getContent().tables['case-templates'];
  const requested = params.get('case');
  const found = templates.find((c) => c.id === requested);
  if (found) return { caseId: found.id, ward: false };
  const wardCase = templates.find((c) => c.id === params.get('wardcase'));
  return wardCase ? { wardCaseId: wardCase.id } : {};
}

export function GameScreen({ settings, devProxy }: GameScreenProps) {
  const session: GameSession = useMemo(
    () =>
      createGameSession({
        config: pickConfig(),
        tables: getContent().tables,
        params: {
          seed: pickSeed(),
          ...pickParams(),
          ...pickCase(),
          nurseConfirmHighRisk: settings.nurseConfirmHighRisk,
        },
        gateway: createAiGateway(settings, devProxy ? { proxy: devProxy } : {}),
        saves: createLazySaveService(),
        onSaveError: () => undefined,
      }),
    // 一局遊戲只在進入畫面時建立；中途改設定不會換局
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
