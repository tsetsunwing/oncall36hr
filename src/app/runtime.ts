/**
 * Engine 執行環境：持有目前 state，派發 event，執行 effects。
 * SAVE effect 交畀 saveService；其餘 effect（AI_REQUEST、NOTICE、SET_SPEED）交畀 onEffect。
 * 定時器、AI gateway 嘅接駁屬 M2；呢度只提供同步 dispatch。
 */
import type { Effect, Engine, EngineEvent, GameState } from '@/engine';
import type { SaveService } from './saveService';

export interface GameRuntimeOptions {
  engine: Engine;
  saves: SaveService;
  initialState: GameState;
  onState?: (state: GameState) => void;
  onEffect?: (effect: Effect) => void;
  onSaveError?: (error: unknown, effect: Extract<Effect, { type: 'SAVE' }>) => void;
}

export interface GameRuntime {
  getState(): GameState;
  dispatch(event: EngineEvent): Effect[];
  /** 等待所有已觸發嘅存檔完成（測試／離開頁面前用） */
  flushSaves(): Promise<void>;
}

export function createGameRuntime(options: GameRuntimeOptions): GameRuntime {
  let state = options.initialState;
  let saveQueue: Promise<void> = Promise.resolve();

  function runSave(snapshot: GameState, effect: Extract<Effect, { type: 'SAVE' }>) {
    saveQueue = saveQueue
      .then(() => options.saves.save(snapshot, effect.target))
      .then(
        () => undefined,
        (error: unknown) => {
          options.onSaveError?.(error, effect);
        },
      );
  }

  return {
    getState: () => state,
    dispatch(event) {
      const result = options.engine.reduce(state, event);
      state = result.state;
      for (const effect of result.effects) {
        if (effect.type === 'SAVE') runSave(state, effect);
        else options.onEffect?.(effect);
      }
      options.onState?.(state);
      return result.effects;
    },
    flushSaves: () => saveQueue,
  };
}
