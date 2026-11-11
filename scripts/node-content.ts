/**
 * tsx／Node 版的內容載入：src/content 走 Vite 的 ?raw 讀 CSV，Node 唔識，
 * 所以這裡直接由磁碟讀同一批 CSV，再用同一個 withDrugEffectTables 併入。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDrugEffectTables, withDrugEffectTables } from '../src/content/drugEffectRows';
import { rawContent } from '../src/content/data';
import { loadContent, type ContentBundle, type RawContent } from '../src/content/loader';

const CSV = 'drug-class-effects.csv';

/** npm script 同 vitest 都由 repo root 跑；搵唔到就退回模組自己嘅位置。 */
function dataDir(): string {
  const fromCwd = resolve(process.cwd(), 'src/content/data');
  if (existsSync(resolve(fromCwd, CSV))) return fromCwd;
  if (import.meta.url.startsWith('file:')) {
    return fileURLToPath(new URL('../src/content/data/', import.meta.url));
  }
  throw new Error('搵唔到 src/content/data');
}

const readCsv = (name: string): string => readFileSync(resolve(dataDir(), name), 'utf8');

export function nodeRawContent(): RawContent {
  const parsed = parseDrugEffectTables(
    readCsv('drug-class-effects.csv'),
    readCsv('drug-effect-overrides.csv'),
    readCsv('effect-categories.csv'),
  );
  return { config: rawContent.config, tables: withDrugEffectTables(rawContent.tables, parsed) };
}

export function nodeContent(): ContentBundle {
  return loadContent(nodeRawContent());
}
