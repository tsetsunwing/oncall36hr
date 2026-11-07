/**
 * 存檔 schema 遷移鏈。`migrations[n]` 負責把 schema n 嘅 raw state 升到 n + 1。
 * 未來每次改 GameState 形狀：CURRENT_SCHEMA + 1，並喺度加一個函數（implementation-plan §12.1、T-L）。
 */
import { hashString } from '../core/rng';

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

/**
 * schema 2 → 3（M3）：order 加執行者種類、取消時間、結果狀態、把關紀錄；病人加後果效果同已回報報告；
 * state 加玩法選項。舊存檔嘅 order 全部當作已放行（冇把關紀錄）。
 */
function migrateV2toV3(raw: RawState): RawState {
  const orders = (raw.orders ?? {}) as Record<string, Record<string, unknown>>;
  const patients = (raw.patients ?? {}) as Record<string, Record<string, unknown>>;
  return {
    ...raw,
    options: { nurseConfirmHighRisk: true },
    orders: Object.fromEntries(
      Object.entries(orders).map(([id, order]) => [
        id,
        {
          ...order,
          executorKind: typeof order.executor === 'string' ? 'NURSE' : null,
          cancelledAt: null,
          resultStatus: null,
          sampledState: null,
          gate: null,
        },
      ]),
    ),
    patients: Object.fromEntries(
      Object.entries(patients).map(([id, patient]) => {
        const hidden = (patient.hidden ?? {}) as Record<string, unknown>;
        const visible = (patient.visible ?? {}) as Record<string, unknown>;
        return [
          id,
          {
            ...patient,
            hidden: { ...hidden, activeEffects: [] },
            visible: { ...visible, reports: [] },
          },
        ];
      }),
    ),
  };
}

/** schema 3 → 4（M4）：加入 ward 狀態；舊存檔係單一病人，ward 停用 */
function migrateV3toV4(raw: RawState): RawState {
  return {
    ...raw,
    ward: {
      enabled: false,
      generated: false,
      location: { bed: null, movingTo: null, arriveAt: null },
      sub: null,
      impressions: {},
      calls: [],
      contacts: {},
      draft: null,
      tasks: [],
      ledger: [],
      tags: {},
      plannedCalls: 0,
      counters: { call: 0, task: 0 },
    },
  };
}

/** schema 4 → 5（M5）：加入搶救、死亡流程同分數 ledger；舊存檔當作冇發生過心臟停頓 */
function migrateV4toV5(raw: RawState): RawState {
  return { ...raw, resus: null, death: null, scoreLedger: [] };
}

/** schema 5 → 6（M4b）：電話加入 purpose／exchange；進行中嘅 SBAR 草稿作廢（缺起草時生命體徵） */
function migrateV5toV6(raw: RawState): RawState {
  const ward = (raw.ward ?? {}) as Record<string, unknown>;
  const calls = Array.isArray(ward.calls) ? (ward.calls as Record<string, unknown>[]) : [];
  return {
    ...raw,
    ward: {
      ...ward,
      draft: null,
      calls: calls.map((call) => ({ ...call, purpose: 'GENERAL', exchange: null })),
    },
  };
}

/**
 * schema 6 → 7（M6）：加入 shift 狀態同 rounds RNG 分流。
 * 舊存檔冇 M6 時間線事件（巡房、交更、精力），載入後只作為連續遊玩，唔會補排。
 */
function migrateV6toV7(raw: RawState): RawState {
  const rng = (raw.rng ?? {}) as Record<string, unknown>;
  const seed = typeof raw.seed === 'string' ? raw.seed : '';
  return {
    ...raw,
    rng: { ...rng, rounds: hashString(`${seed}\u0000rounds`) },
    shift: {
      rounds: { started: 0, completed: 0, active: null, history: [] },
      mealsTaken: [],
      energy: { percent: 100, lastNudgeAt: null },
      selfCare: { active: null, lastEndedAt: {} },
      overtime: { enteredAt: null, workInFlight: false },
      handover: { selected: [] },
      ending: null,
    },
  };
}

/**
 * schema 7 → 8（M7）：M4 嘅 ward.ledger 同 M5 嘅 scoreLedger 合併成唯一 scoreLedger（按時間排序、重新編號）；
 * 加入優先次序追蹤。舊存檔嘅分項名稱本身已經一致，只需要改欄位名。
 */
function migrateV7toV8(raw: RawState): RawState {
  const ward = (raw.ward ?? {}) as Record<string, unknown>;
  const { ledger: wardLedger, ...wardRest } = ward;
  const fromWard = (Array.isArray(wardLedger) ? wardLedger : []).map(
    (e: Record<string, unknown>) => ({
      t: e.t,
      subscore: e.subscore,
      rule: e.rule,
      delta: e.delta,
      patientId: e.patientId ?? null,
      callId: e.callId ?? null,
      evidenceRef: null,
      facts: {},
    }),
  );
  const fromScore = (Array.isArray(raw.scoreLedger) ? raw.scoreLedger : []).map(
    (e: Record<string, unknown>) => ({
      t: e.t,
      subscore: e.category,
      rule: e.code,
      delta: e.delta,
      patientId: e.patientId ?? null,
      callId: null,
      evidenceRef: null,
      facts: {},
    }),
  );
  const merged = [...fromWard, ...fromScore]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Number(a.entry.t) - Number(b.entry.t) || a.index - b.index)
    .map(({ entry }, index) => ({ ...entry, id: `sc${String(index + 1)}` }));
  const orders = (raw.orders ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const migratedOrders = Object.fromEntries(
    Object.entries(orders).map(([id, order]) => {
      const gate = order?.gate as Record<string, unknown> | null | undefined;
      if (!order || !gate) return [id, order];
      const reviews = (Array.isArray(gate.reviews) ? gate.reviews : []).map(
        (review: Record<string, unknown>) => {
          const safety = review.safety as Record<string, unknown> | null | undefined;
          return safety ? { ...review, safety: { ...safety, tokenValues: {} } } : review;
        },
      );
      const danger = gate.danger as Record<string, unknown> | null | undefined;
      return [
        id,
        {
          ...order,
          gate: { ...gate, reviews, danger: danger ? { ...danger, tokenValues: {} } : danger },
        },
      ];
    }),
  );
  return {
    ...raw,
    orders: migratedOrders,
    ward: wardRest,
    scoreLedger: merged,
    priority: { lastAttended: {}, urgency: {} },
  };
}

export const migrations: MigrationRegistry = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
};

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
