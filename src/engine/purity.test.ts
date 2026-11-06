import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('engine determinism (belt and braces on top of ESLint)', () => {
  const files = sourceFiles(join(import.meta.dirname));
  const stripped = files.map((file) => ({
    file,
    code: readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, ''),
  }));

  it('finds engine sources to check', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each([
    'Math.random',
    'Date.now',
    'new Date',
    'performance.now',
    'crypto.',
    'setTimeout',
    'fetch(',
    'localStorage',
    'indexedDB',
  ])('engine source never uses %s', (needle) => {
    const offenders = stripped.filter(({ code }) => code.includes(needle)).map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
