import { describe, expect, it } from 'vitest';
import { ContentValidationError, getContent, loadContent, rawContent, validateContent } from '.';
import { TABLE_NAMES } from './schema/tables';

const clone = <T>(value: T): T => structuredClone(value);

describe('content loader', () => {
  const M2_TABLES = [
    'case-templates',
    'case-fsm',
    'trajectories',
    'order-catalog',
    'formulary',
    'order-effects',
    'rhythms',
    'mews',
    'nurse-roster',
    'quick-words',
    'results',
    'consequences',
    'difficulty-profiles',
    'rank-complexity',
    'subordinates',
    'delegation-results',
    'call-templates',
    'rank-behaviour',
    'consult-departments',
    'scoring-rules',
    'ward-layout',
    'acls-transitions',
    'death-process',
  ] as const;

  it('accepts the shipped bundle: M2–M5 tables are filled, every later table is still an empty array', () => {
    const content = getContent();
    expect(Object.keys(content.tables)).toHaveLength(TABLE_NAMES.length);
    for (const name of TABLE_NAMES) {
      if ((M2_TABLES as readonly string[]).includes(name)) {
        expect(content.tables[name].length, name).toBeGreaterThan(0);
      } else {
        expect(content.tables[name], name).toEqual([]);
      }
    }
  });

  it('accepts a bundle where every table is an explicit empty array', () => {
    const raw = clone(rawContent);
    raw.tables = Object.fromEntries(TABLE_NAMES.map((n) => [n, []]));
    expect(validateContent(raw).ok).toBe(true);
  });

  it('rejects a missing table (empty tables must be explicit)', () => {
    const raw = clone(rawContent);
    delete raw.tables.rhythms;
    const result = validateContent(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.table)).toContain('rhythms');
  });

  it('rejects unknown tables (typos)', () => {
    const raw = clone(rawContent);
    raw.tables.rythms = [];
    const result = validateContent(raw);
    expect(result.ok).toBe(false);
  });

  it('rejects a table that is not an array', () => {
    const raw = clone(rawContent);
    raw.tables.formulary = { id: 'x' };
    expect(validateContent(raw).ok).toBe(false);
  });

  it('rejects records without an id', () => {
    const raw = clone(rawContent);
    raw.tables['rounds-topics'] = [{ label: 'no id' }];
    expect(validateContent(raw).ok).toBe(false);
  });

  it('rejects duplicate ids within a table', () => {
    const raw = clone(rawContent);
    raw.tables['rounds-topics'] = [{ id: 'a' }, { id: 'a' }];
    const result = validateContent(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toContain('id 重複');
  });

  it('accepts valid records', () => {
    const raw = clone(rawContent);
    raw.tables['rounds-topics'] = [{ id: 'x', anything: 'goes until the table is tightened' }];
    const result = validateContent(raw);
    expect(result.ok).toBe(true);
  });

  it('rejects config with missing or unknown keys', () => {
    const missing = clone(rawContent) as { config: Record<string, unknown> } & typeof rawContent;
    delete missing.config.clock;
    expect(validateContent(missing).ok).toBe(false);

    const extra = clone(rawContent) as { config: Record<string, unknown> } & typeof rawContent;
    extra.config.magicNumber = 42;
    expect(validateContent(extra).ok).toBe(false);
  });

  it('rejects config with an inconsistent default speed', () => {
    const raw = clone(rawContent) as {
      config: { clock: { defaultSpeed: number } };
    } & typeof rawContent;
    raw.config.clock.defaultSpeed = 3;
    expect(validateContent(raw).ok).toBe(false);
  });

  it('loadContent throws ContentValidationError listing issues', () => {
    const raw = clone(rawContent);
    raw.tables = {};
    expect(() => loadContent(raw)).toThrow(ContentValidationError);
  });
});

describe('config designer defaults', () => {
  const { config } = getContent();

  it('holds the plan defaults (C3 B, S32d, shift lengths, AI timeout)', () => {
    expect(config.clock.realSecondsPerGameMinuteAt1x).toBe(2);
    expect(config.clock.cprSlowFactor).toBe(0.5);
    expect(config.shifts.day.regularSeconds).toBe(36000);
    expect(config.shifts.night.regularSeconds).toBe(50400);
    expect(config.shifts.onCall.regularSeconds).toBe(122400);
    expect(config.shifts.overtimeSeconds).toBe(7200);
    expect(config.staff.reliability).toEqual({ NOVICE: 0.7, NORMAL: 0.85, SENIOR: 0.95 });
    expect(config.staff.speedMultiplier).toEqual({ NOVICE: 1.5, NORMAL: 1.0, SENIOR: 0.8 });
    expect(config.ai.requestTimeoutMs).toBe(25000);
    expect(config.ai.autoRepairRetries).toBe(1);
    expect(config.ai.defaultBaseUrl).toBe('https://api.openai.com/v1');
    expect(config.ward.bedCount).toBe(20);
    expect(config.saves).toMatchObject({ manualSlots: 5, autoSlots: 2, aiFailureSlots: 1 });
  });

  it('keeps on-call segments consistent with the regular length', () => {
    const hours = config.shifts.onCall.segmentHours.reduce((a, b) => a + b, 0);
    expect(hours * 3600).toBe(config.shifts.onCall.regularSeconds);
  });
});
