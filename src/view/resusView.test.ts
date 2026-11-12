import { describe, expect, it } from 'vitest';
import { getConfig, getContent } from '@/content';
import { createEngine, type EngineEvent, type GameState } from '@/engine';
import { onlyResus } from '@/engine/acls/kit';
import { selectGameView, type ViewEnv } from './gameView';
import { formatDuration } from './clock';

const baseConfig = getConfig();
const config = { ...baseConfig, clock: { ...baseConfig.clock, pauseWhileAiPending: false } };
const tables = getContent().tables;
const engine = createEngine(config, { tables });
const env: ViewEnv = { tables, config };
const BASE_RATE = 60 / (config.clock.realSecondsPerGameMinuteAt1x * 1000);

const say = (text: string): EngineEvent => ({
  type: 'PLAYER_INTENT',
  intent: { type: 'SUBMIT_CHAT', patientId: 'p1', text },
});

function advance(state: GameState, seconds: number): GameState {
  const rate = state.paused ? 0 : BASE_RATE * (state.clock.cprSlow ? 0.5 : state.clock.speed);
  return engine.reduce(state, { type: 'TICK', dtRealMs: seconds / rate }).state;
}

function run(caseId: string, commands: [string, number][], pre = 200): GameState {
  let state = engine.init({
    seed: 'view-resus',
    mode: 'NIGHT',
    difficulty: 'MEDIUM',
    playerRank: 'MO',
    caseId,
  });
  state = advance(state, pre);
  for (const [text, wait] of commands) {
    state = engine.reduce(state, say(text)).state;
    state = advance(state, wait);
  }
  return state;
}

describe('搶救 ViewModel', () => {
  it('停頓前冇 resus／death；停頓後監察儀顯示節律警報同無脈搏破折號', () => {
    expect(selectGameView(run('acs-vf-01', [], 10), env).resus).toBeNull();
    const view = selectGameView(run('acs-vf-01', []), env);
    expect(view.resus?.status).toBe('ARREST');
    expect(view.resus?.shockable).toBe(true);
    expect(view.monitor?.pulseless).toBe(true);
    expect(view.monitor?.rhythmAlarm).toBe('ALARM');
    expect(view.monitor?.hr.text).toBe('—');
    expect(view.monitor?.hr.band).toBe('normal');
    expect(view.monitor?.bp.text).toBe('—');
    expect(view.monitor?.bp.band).toBe('normal');
    expect(view.monitor?.spo2.band).toBe('normal');
    expect(view.monitor?.rr.band).toBe('normal');
    expect(view.monitor?.rhythmLabel).toContain('Fibrillation');
  });

  it('CPR 開始後 clock.cprSlow ＝ true；cycle 計時同 hands-off 反映喺 view', () => {
    const view = selectGameView(run('acs-vf-01', [['cpr', 30]]), env);
    expect(view.clock.cprSlow).toBe(true);
    expect(view.resus?.cpr).toBe('ACTIVE');
    expect(view.resus?.cycleElapsedSec).toBeGreaterThan(0);
  });

  it('唔洩露隱藏資料：病因 id、ROSC 機率、擲骰結果、基礎機率', () => {
    const state = run('acs-vf-01', [
      ['cpr', 10],
      ['rhythm check', 15],
      ['defib 200 j', 15],
    ]);
    expect(onlyResus(state)?.lastRoll).not.toBeNull();
    const json = JSON.stringify(selectGameView(state, env));
    for (const secret of ['lastRoll', 'causeIds', 'rocBaseP', 'terms', '"success"', 'noFlowSec']) {
      expect(json, secret).not.toContain(secret);
    }
    const resus = selectGameView(state, env).resus;
    const thrombosis = resus?.causes.find((c) => c.id === 'cause.thrombosis');
    expect(thrombosis?.checked).toBe(false);
    expect(resus?.causes.length).toBeGreaterThanOrEqual(8);
    expect(new Set(resus?.causes.map((c) => c.group))).toEqual(new Set(['H', 'T']));
  });

  it('rhythm check 滿 cycle 數先可以停止搶救', () => {
    const early = selectGameView(run('terminal-01', [['cpr', 10]]), env);
    expect(early.resus?.canStop).toBe(false);
    const cmds: [string, number][] = [['cpr', 10]];
    for (let i = 0; i < config.acls.minCyclesBeforeStop; i += 1) cmds.push(['rhythm check', 15]);
    expect(selectGameView(run('terminal-01', cmds), env).resus?.canStop).toBe(true);
  });

  it('死亡流程 view：預填內容、床位未釋放；完成四步先釋放', () => {
    const cmds: [string, number][] = [['cpr', 10]];
    for (let i = 0; i < config.acls.minCyclesBeforeStop; i += 1) cmds.push(['rhythm check', 15]);
    cmds.push(['stop cpr', 10]);
    let state = run('terminal-01', cmds);
    const view = selectGameView(state, env).death;
    expect(view?.bedReleased).toBe(false);
    expect(view?.steps.map((s) => s.step)).toEqual([
      'CERTIFICATE',
      'NOTIFY_SENIOR',
      'PHONE_FAMILY',
      'RECORD',
    ]);
    const patient = Object.values(state.patients)[0];
    expect(view?.prefill.name).toBe(patient?.demographics.name);
    expect(view?.prefill.seniorRank).toBe('RES');
    expect(view?.prefill.cause).not.toBe('');

    for (const step of ['CERTIFICATE', 'NOTIFY_SENIOR', 'PHONE_FAMILY', 'RECORD']) {
      state = engine.reduce(state, {
        type: 'PLAYER_INTENT',
        intent: {
          type: 'EXTENSION',
          module: 'death',
          name: 'COMPLETE_STEP',
          payload: { patientId: view?.patientId ?? '', step },
        },
      }).state;
    }
    expect(selectGameView(state, env).death?.bedReleased).toBe(true);
  });
});

describe('formatDuration', () => {
  it('mm:ss，負數當 0', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(125.9)).toBe('02:05');
    expect(formatDuration(-5)).toBe('00:00');
    expect(formatDuration(3600)).toBe('60:00');
  });
});
