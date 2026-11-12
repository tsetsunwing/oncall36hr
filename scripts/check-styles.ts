/**
 * 樣式數值檢查：顏色同字級只准用 var(--…)，不准寫死。
 * 唯一例外係 src/app/tokens.css（數值層）。
 *
 * 現有寫死嘅數量記錄在 style-baseline.json；呢個腳本只阻止「新增」，
 * 所以舊畫面唔會因為呢個檢查而爆。清完一批之後用 --update 重寫 baseline。
 *
 *   tsx scripts/check-styles.ts           檢查
 *   tsx scripts/check-styles.ts --update  重寫 baseline（只會在數量減少時允許）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src';
const TOKENS = join('src', 'app', 'tokens.css');
const BASELINE = 'style-baseline.json';

/** 需要管嘅屬性：顏色類 */
const COLOUR_PROPS = [
  'color',
  'background',
  'background-color',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'fill',
  'stroke',
  'caret-color',
  'text-decoration-color',
];

const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;
const FONT_SIZE = /^font-size\s*:\s*(.+)$/u;

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...cssFiles(path));
    else if (name.endsWith('.css')) out.push(path);
  }
  return out;
}

/** 掃一個 CSS 檔，回傳 { key → 次數 }；key＝檔名|屬性|寫死嘅值 */
function scan(file: string): Map<string, number> {
  const text = readFileSync(file, 'utf8');
  const found = new Map<string, number>();
  const bump = (key: string) => found.set(key, (found.get(key) ?? 0) + 1);
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    const size = FONT_SIZE.exec(trimmed);
    if (size) {
      const value = (size[1] ?? '').trim();
      if (!value.startsWith('var(') && value !== 'inherit' && value !== '0') {
        bump(`${file}|font-size|${value.replace(/;$/u, '')}`);
      }
      continue;
    }
    const colon = trimmed.indexOf(':');
    if (colon < 0) continue;
    const prop = trimmed.slice(0, colon).trim();
    if (!COLOUR_PROPS.includes(prop)) continue;
    const value = trimmed.slice(colon + 1);
    if (!COLOUR_LITERAL.test(value)) continue;
    bump(`${file}|${prop}|${value.replace(/;$/u, '').trim()}`);
  }
  return found;
}

function collect(): Map<string, number> {
  const all = new Map<string, number>();
  for (const file of cssFiles(ROOT)) {
    if (relative('.', file) === TOKENS) continue;
    for (const [key, count] of scan(file)) all.set(key, (all.get(key) ?? 0) + count);
  }
  return all;
}

function baselineExists(): boolean {
  try {
    statSync(BASELINE);
    return true;
  } catch {
    return false;
  }
}

function readBaseline(): Map<string, number> {
  try {
    const raw = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, number>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

function writeBaseline(found: Map<string, number>): void {
  const sorted = [...found.entries()].sort(([a], [b]) => a.localeCompare(b));
  writeFileSync(BASELINE, `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`, 'utf8');
}

const current = collect();
const update = process.argv.includes('--update');

if (update) {
  const fresh = !baselineExists();
  const baseline = readBaseline();
  const grown: string[] = [];
  for (const [key, count] of current) {
    const before = baseline.get(key) ?? 0;
    if (count > before) grown.push(`${key}：${String(before)} → ${String(count)}`);
  }
  if (!fresh && grown.length > 0) {
    console.error('❌ baseline 只可以縮細，唔可以變大。以下項目新增了寫死數值：');
    for (const line of grown) console.error(`  - ${line}`);
    process.exit(1);
  }
  writeBaseline(current);
  console.log(`✅ 已更新 ${BASELINE}：${String(current.size)} 個項目`);
  process.exit(0);
}

const baseline = readBaseline();
const problems: string[] = [];
for (const [key, count] of current) {
  const before = baseline.get(key) ?? 0;
  if (count > before) problems.push(`${key}（現有 ${String(count)}，允許 ${String(before)}）`);
}

const total = [...current.values()].reduce((sum, n) => sum + n, 0);
if (problems.length > 0) {
  console.error('❌ 新增了寫死的顏色或字級。請改用 src/app/tokens.css 嘅 var(--…)：');
  for (const line of problems) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`✅ 樣式數值：沒有新增寫死數值（現存 ${String(total)} 處，全部在 ${BASELINE} 之內）`);
