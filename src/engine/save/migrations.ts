/**
 * 存檔 schema 遷移鏈。`migrations[n]` 負責把 schema n 嘅 raw state 升到 n + 1。
 * 未來每次改 GameState 形狀：CURRENT_SCHEMA + 1，並喺度加一個函數（implementation-plan §12.1、T-L）。
 */
export type RawState = Record<string, unknown>;
export type Migration = (raw: RawState) => RawState;
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/** schema 1 → 2（M2）：加入病人、對話、Action Log；order 加來源／參數／執行者 */
function migrateV1toV2(raw: RawState): RawState {
  const orders = (raw.orders ?? {}) as Record<string, Record<string, unknown>>;
  const counters = (raw.counters ?? {}) as Record<string, unknown>;
  return {
    ...raw,
    orders: Object.fromEntries(
      Object.entries(orders).map(([id, order]) => [
        id,
        {
          ...order,
          source: 'MANUAL',
          params: { drugFormularyId: null, dose: null, route: null },
          executor: null,
        },
      ]),
    ),
    patients: {},
    chats: {},
    actionLog: [],
    counters: { ...counters, line: 0, log: 0 },
  };
}

export const migrations: MigrationRegistry = { 1: migrateV1toV2 };

export type MigrateResult =
  | { ok: true; raw: RawState; fromSchema: number }
  | {
      ok: false;
      code: 'SCHEMA_MISSING' | 'SCHEMA_TOO_NEW' | 'NO_MIGRATION' | 'MIGRATION_FAILED';
      message: string;
    };

export function migrateRawState(
  raw: RawState,
  targetSchema: number,
  registry: MigrationRegistry = migrations,
): MigrateResult {
  const fromSchema = raw.schema;
  if (typeof fromSchema !== 'number' || !Number.isInteger(fromSchema) || fromSchema < 1) {
    return { ok: false, code: 'SCHEMA_MISSING', message: '存檔缺少有效嘅 schema 版本' };
  }
  if (fromSchema > targetSchema) {
    return {
      ok: false,
      code: 'SCHEMA_TOO_NEW',
      message: `存檔 schema ${String(fromSchema)} 比目前支援嘅 ${String(targetSchema)} 新`,
    };
  }
  let current = raw;
  for (let version = fromSchema; version < targetSchema; version++) {
    const step = registry[version];
    if (!step) {
      return {
        ok: false,
        code: 'NO_MIGRATION',
        message: `缺少 schema ${String(version)} → ${String(version + 1)} 嘅 migration`,
      };
    }
    try {
      current = { ...step(current), schema: version + 1 };
    } catch (error) {
      return {
        ok: false,
        code: 'MIGRATION_FAILED',
        message: `schema ${String(version)} → ${String(version + 1)} migration 失敗：${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
  return { ok: true, raw: current, fromSchema };
}
