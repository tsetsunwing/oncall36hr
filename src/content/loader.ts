import type { z } from 'zod';
import { configSchema, type GameConfig } from './schema/config';
import { validateCrossReferences } from './crossRefs';
import type { ContentIssue } from './schema/issues';
import { TABLE_NAMES, tableSchemas, type ContentRecord, type Tables } from './schema/tables';

export interface RawContent {
  config: unknown;
  tables: Record<string, unknown>;
}

export interface ContentBundle {
  config: GameConfig;
  tables: Tables;
}

export type { ContentIssue };

export type ContentResult =
  { ok: true; content: ContentBundle } | { ok: false; issues: ContentIssue[] };

export class ContentValidationError extends Error {
  readonly issues: ContentIssue[];
  constructor(issues: ContentIssue[]) {
    super(
      `內容驗證失敗（${issues.length} 項）：\n` +
        issues.map((i) => `- [${i.table}] ${i.path}：${i.message}`).join('\n'),
    );
    this.name = 'ContentValidationError';
    this.issues = issues;
  }
}

const formatPath = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '(根)' : path.map(String).join('.');

export function validateContent(raw: RawContent): ContentResult {
  const issues: ContentIssue[] = [];

  const configResult = configSchema.safeParse(raw.config);
  if (!configResult.success) {
    for (const issue of configResult.error.issues) {
      issues.push({ table: 'config', path: formatPath(issue.path), message: issue.message });
    }
  }

  const tables: Record<string, readonly ContentRecord[]> = {};
  for (const name of TABLE_NAMES) {
    if (!(name in raw.tables)) {
      issues.push({ table: name, path: '(根)', message: '缺少此內容表（空表必須明確寫 []）' });
      continue;
    }
    const parsed = (tableSchemas[name] as z.ZodType<readonly ContentRecord[]>).safeParse(
      raw.tables[name],
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ table: name, path: formatPath(issue.path), message: issue.message });
      }
      continue;
    }
    const seen = new Set<string>();
    parsed.data.forEach((record, index) => {
      if (seen.has(record.id)) {
        issues.push({ table: name, path: `${index}.id`, message: `id 重複：${record.id}` });
      }
      seen.add(record.id);
    });
    tables[name] = parsed.data;
  }

  const known = new Set<string>(TABLE_NAMES);
  for (const name of Object.keys(raw.tables)) {
    if (!known.has(name)) {
      issues.push({ table: name, path: '(根)', message: '未知內容表（可能是拼寫錯誤）' });
    }
  }

  if (issues.length > 0 || !configResult.success) return { ok: false, issues };
  const typedTables = tables as unknown as Tables;
  issues.push(...validateCrossReferences(typedTables));
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, content: { config: configResult.data, tables: typedTables } };
}

export function loadContent(raw: RawContent): ContentBundle {
  const result = validateContent(raw);
  if (!result.ok) throw new ContentValidationError(result.issues);
  return result.content;
}
