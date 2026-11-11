import { csvTables } from './csvTables';
import { rawContent as jsonContent } from './data';
import { withDrugEffectTables } from './drugEffectRows';
import { loadContent, type ContentBundle, type RawContent } from './loader';

/** JSON 表 ＋ 三張 CSV 表。 */
export const rawContent: RawContent = {
  config: jsonContent.config,
  tables: withDrugEffectTables(jsonContent.tables, csvTables),
};

let cached: ContentBundle | undefined;

export function getContent(): ContentBundle {
  cached ??= loadContent(rawContent);
  return cached;
}

export function getConfig() {
  return getContent().config;
}

export { loadContent, validateContent, ContentValidationError } from './loader';
export type { ContentBundle, ContentIssue, RawContent } from './loader';
export type { GameConfig } from './schema/config';
export type { TableName } from './schema/tables';
