/**
 * 存檔快照：canonical JSON（key 排序）＋ schema 版本 ＋ migration hook ＋ zod 驗證。
 * serialize → deserialize → serialize 必須位元級一致（implementation-plan §16 M1 驗收）。
 * 所有失敗都以 Result 回傳，唔 throw，由呼叫方保留原槽（§12.1）。
 */
import { CURRENT_SCHEMA, gameStateSchema, type GameState } from '../core/state';
import { migrateRawState, migrations, type MigrationRegistry, type RawState } from './migrations';

export const SAVE_FORMAT = 'dandu-save';

export interface SaveSummary {
  mode: GameState['mode'];
  gameTime: number;
  difficulty: GameState['difficulty'];
  rank: GameState['playerRank'];
  patientsActive: number;
}

export function summarizeState(state: GameState): SaveSummary {
  return {
    mode: state.mode,
    gameTime: state.clock.t,
    difficulty: state.difficulty,
    rank: state.playerRank,
    patientsActive: 0,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonicalize(v)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

/** 穩定序列化：同一個 state 永遠產生同一個字串 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function serializeSnapshot(state: GameState, appVersion: string): string {
  return canonicalStringify({ format: SAVE_FORMAT, appVersion, state });
}

export type DeserializeErrorCode =
  | 'INVALID_JSON'
  | 'BAD_FORMAT'
  | 'SCHEMA_MISSING'
  | 'SCHEMA_TOO_NEW'
  | 'NO_MIGRATION'
  | 'MIGRATION_FAILED'
  | 'INVALID_STATE';

export type DeserializeResult =
  | { ok: true; state: GameState; appVersion: string; migratedFrom: number | null }
  | { ok: false; code: DeserializeErrorCode; message: string };

function isRecord(value: unknown): value is RawState {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function deserializeSnapshot(
  json: string,
  options: {
    registry?: MigrationRegistry;
    targetSchema?: number;
    validate?: (
      raw: RawState,
    ) => { success: true; data: GameState } | { success: false; message: string };
  } = {},
): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, code: 'INVALID_JSON', message: '存檔唔係有效嘅 JSON' };
  }
  if (!isRecord(parsed) || parsed.format !== SAVE_FORMAT || !isRecord(parsed.state)) {
    return { ok: false, code: 'BAD_FORMAT', message: '存檔格式唔正確' };
  }
  const appVersion = typeof parsed.appVersion === 'string' ? parsed.appVersion : 'unknown';

  const target = options.targetSchema ?? CURRENT_SCHEMA;
  const migrated = migrateRawState(parsed.state, target, options.registry ?? migrations);
  if (!migrated.ok) return migrated;

  const validate =
    options.validate ??
    ((raw: RawState) => {
      const result = gameStateSchema.safeParse(raw);
      return result.success
        ? ({ success: true, data: result.data } as const)
        : ({ success: false, message: result.error.message } as const);
    });
  const validated = validate(migrated.raw);
  if (!validated.success) {
    return { ok: false, code: 'INVALID_STATE', message: `存檔內容驗證失敗：${validated.message}` };
  }
  return {
    ok: true,
    state: validated.data,
    appVersion,
    migratedFrom: migrated.fromSchema === target ? null : migrated.fromSchema,
  };
}
