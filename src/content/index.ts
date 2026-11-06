import { rawContent } from './data';
import { loadContent, type ContentBundle } from './loader';

let cached: ContentBundle | undefined;

export function getContent(): ContentBundle {
  cached ??= loadContent(rawContent);
  return cached;
}

export function getConfig() {
  return getContent().config;
}

export { rawContent } from './data';
export { loadContent, validateContent, ContentValidationError } from './loader';
export type { ContentBundle, ContentIssue, RawContent } from './loader';
export type { GameConfig } from './schema/config';
export type { TableName } from './schema/tables';
