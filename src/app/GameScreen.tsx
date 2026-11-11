import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createAiGateway, type DevProxy } from '@/ai';
import { getConfig, getContent } from '@/content';
import { DEFAULT_WARD_CODE, WARD_CODES } from '@/content/wards';
import { ui } from '@/i18n';
import type { GameState } from '@/engine';
import type { Settings } from '@/storage';
import { GamePage } from '@/ui';
import { createGameSession, type GameSession } from './gameSession';
import { createLazySaveService } from './lazySaves';
import { hashParams, navigate } from './router';
import { trackSaves } from './saveFlush';

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

/**
 * 開局選項（hash 參數，供測試與預覽用）：mode／difficulty／rank／ward（病房代碼，例如 MED、SRG）。
 * 開局一律 20 床病房；單病人模式只保留 `#/game?case=<模板 id>` 一條路，唔再由 `ward=single` 開啟。
 */
function pickParams() {
  const params = hashParams(window.location.hash);
  return {
    mode: pick(params.get('mode'), MODES, 'NIGHT'),
    difficulty: pick(params.get('difficulty'), DIFFICULTIES, 'MEDIUM'),
    playerRank: pick(params.get('rank'), RANKS, 'MO'),
    ward: true,
    wardCode: pick(params.get('ward'), WARD_CODES, DEFAULT_WARD_CODE),
  };
}

/**
 * 測試與預覽用 hash 參數：callrate=每小時來電基數（上限 120）；
 * realsec=1 倍速時每遊戲分鐘嘅真實秒數（0.005–60，加快 e2e）。不設則用內容設定。
 */
function pickConfig() {
  const base = getConfig();
  const params = hashParams(window.location.hash);
  const rate = Number(params.get('callrate'));
  const realSec = Number(params.get('realsec'));
  const withCalls =
    Number.isFinite(rate) && rate > 0
      ? { ...base, phone: { ...base.phone, baseCallsPerHour: Math.min(Math.round(rate), 120) } }
      : base;
  const withClock =
    Number.isFinite(realSec) && realSec >= 0.005 && realSec <= 60
      ? { ...withCalls, clock: { ...withCalls.clock, realSecondsPerGameMinuteAt1x: realSec } }
      : withCalls;
  const aiTimeout = Number(params.get('aitimeout'));
  if (!Number.isFinite(aiTimeout) || aiTimeout < 50 || aiTimeout > 60_000) return withClock;
  return { ...withClock, ai: { ...withClock.ai, requestTimeoutMs: aiTimeout } };
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

type Boot =
  | { kind: 'loading' }
  | { kind: 'new' }
  | { kind: 'ready'; state: GameState; migrated: boolean }
  | { kind: 'error'; code: string };

function useBoot(): Boot {
  const slot = hashParams(window.location.hash).get('slot');
  const [boot, setBoot] = useState<Boot>(slot ? { kind: 'loading' } : { kind: 'new' });
  useEffect(() => {
    if (!slot) return;
    let cancel = false;
    void createLazySaveService()
      .load(slot)
      .then((result) => {
        if (cancel) return;
        if (result.ok)
          setBoot({ kind: 'ready', state: result.state, migrated: result.migratedFrom !== null });
        else setBoot({ kind: 'error', code: result.error });
      });
    return () => {
      cancel = true;
    };
  }, [slot]);
  return boot;
}

function SaveLoadError({ code }: { code: string }) {
  const text = ui.saves.errors[code] ?? ui.saves.errors.UNKNOWN;
  return (
    <section className="page" aria-labelledby="save-error-heading" data-testid="save-load-error">
      <h1 id="save-error-heading">{ui.saves.loadFailed}</h1>
      <p role="alert">{text}</p>
      <p>{ui.saves.loadFailedBody}</p>
      <a className="button-link" href="#/">
        {ui.game.backToStart}
      </a>
    </section>
  );
}

function LiveGame({
  settings,
  devProxy,
  initialState,
  migrated,
}: GameScreenProps & { initialState?: GameState; migrated: boolean }) {
  const session: GameSession = useMemo(
    () => {
      const config = pickConfig();
      return createGameSession({
        config,
        tables: getContent().tables,
        params: {
          seed: pickSeed(),
          ...pickParams(),
          ...pickCase(),
          nurseConfirmHighRisk: settings.nurseConfirmHighRisk,
        },
        gateway: createAiGateway(settings, {
          timeoutMs: config.ai.requestTimeoutMs,
          ...(devProxy ? { proxy: devProxy } : {}),
        }),
        saves: createLazySaveService(),
        ...(initialState ? { initialState } : {}),
        onSaveError: () => undefined,
      });
    },
    // 一局遊戲只在進入畫面時建立；中途改設定不會換局
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    session.start();
    return () => {
      session.stop();
      trackSaves(session.flush());
    };
  }, [session]);

  const view = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return (
    <>
      {migrated ? (
        <p className="notice notice-info" role="status" data-testid="save-migrated">
          {ui.saves.migrated}
        </p>
      ) : null}
      <GamePage
        view={view}
        actions={session.actions}
        onExit={() => {
          trackSaves(session.flush());
          navigate('start');
        }}
      />
    </>
  );
}

export function GameScreen({ settings, devProxy }: GameScreenProps) {
  const boot = useBoot();
  if (boot.kind === 'loading') {
    return (
      <p className="hint" data-testid="save-loading">
        {ui.saves.loading}
      </p>
    );
  }
  if (boot.kind === 'error') return <SaveLoadError code={boot.code} />;
  return (
    <LiveGame
      settings={settings}
      devProxy={devProxy}
      migrated={boot.kind === 'ready' && boot.migrated}
      {...(boot.kind === 'ready' ? { initialState: boot.state } : {})}
    />
  );
}
