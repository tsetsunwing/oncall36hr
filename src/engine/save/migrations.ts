/**
 * 存檔 schema 遷移鏈。`migrations[n]` 負責把 schema n 嘅 raw state 升到 n + 1。
 * 未來每次改 GameState 形狀：CURRENT_SCHEMA + 1，並喺度加一個函數（implementation-plan §12.1、T-L）。
 */
export type RawState = Record<string, unknown>;
export type Migration = (raw: RawState) => RawState;
export type MigrationRegistry = Readonly<Record<number, Migration>>;

export const migrations: MigrationRegistry = {};

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
