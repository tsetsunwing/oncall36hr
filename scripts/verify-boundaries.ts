/**
 * 證明模組邊界真係擋得住：逐個把「故意違規」fixture 寫入 src 對應位置，
 * 確認 ESLint／dependency-cruiser 會以指定規則失敗；control fixture 則必須兩者都通過。
 * fixture 放喺 tests/boundary-fixtures/*.ts.txt（副檔名令佢哋唔會被 tsc／eslint／depcruise 掃到）。
 * 用法：npm run boundaries:verify（CI 會跑）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = join(root, 'tests', 'boundary-fixtures');

interface Fixture {
  name: string;
  target: string;
  /** 預期觸發嘅 ESLint rule id；null ＝ ESLint 必須通過 */
  eslint: string | null;
  /** 預期觸發嘅 dependency-cruiser rule name；null ＝ 必須通過 */
  depcruise: string | null;
  source: string;
}

function parseFixture(file: string): Fixture {
  const text = readFileSync(join(fixtureDir, file), 'utf8');
  const newline = text.indexOf('\n');
  const header = text.slice(0, newline);
  const match = /^\/\/ fixture: (\{.*\})$/.exec(header);
  if (!match?.[1]) throw new Error(`${file}：缺少 "// fixture: {...}" 標頭`);
  const meta = JSON.parse(match[1]) as Pick<Fixture, 'target' | 'eslint' | 'depcruise'>;
  return { name: file.replace(/\.ts\.txt$/, ''), ...meta, source: text.slice(newline + 1) };
}

function run(bin: string[], args: string[]) {
  const result = spawnSync(process.execPath, [...bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

const eslintBin = [join(root, 'node_modules/eslint/bin/eslint.js')];
const depcruiseBin = [join(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs')];

function eslintRuleIds(target: string): { status: number; rules: string[] } {
  const { status, stdout } = run(eslintBin, ['--format', 'json', target]);
  const report = JSON.parse(stdout) as { messages: { ruleId: string | null }[] }[];
  const rules = report.flatMap((r) => r.messages.map((m) => m.ruleId ?? 'parse-error'));
  return { status, rules };
}

function depcruiseRuleNames(): { rules: string[] } {
  const { stdout } = run(depcruiseBin, [
    'src',
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
  ]);
  const report = JSON.parse(stdout) as {
    summary: { violations: { rule: { name: string; severity: string } }[] };
  };
  const rules = report.summary.violations
    .filter((v) => v.rule.severity === 'error')
    .map((v) => v.rule.name);
  return { rules };
}

const failures: string[] = [];
let checkedExitCode = false;
const files = readdirSync(fixtureDir)
  .filter((f) => f.endsWith('.ts.txt'))
  .sort();

for (const file of files) {
  const fixture = parseFixture(file);
  const targetPath = join(root, fixture.target);
  if (existsSync(targetPath)) throw new Error(`${fixture.target} 已存在，拒絕覆寫`);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, fixture.source);
  try {
    const es = eslintRuleIds(fixture.target);
    const dc = depcruiseRuleNames();
    const problems: string[] = [];

    if (fixture.eslint === null) {
      if (es.rules.length > 0) problems.push(`ESLint 應通過，但報：${es.rules.join(', ')}`);
    } else if (es.status === 0 || !es.rules.includes(fixture.eslint)) {
      problems.push(`ESLint 應以 ${fixture.eslint} 失敗，實際：${es.rules.join(', ') || '通過'}`);
    }

    if (fixture.depcruise === null) {
      if (dc.rules.length > 0) problems.push(`depcruise 應通過，但報：${dc.rules.join(', ')}`);
    } else if (!dc.rules.includes(fixture.depcruise)) {
      problems.push(
        `depcruise 應以 ${fixture.depcruise} 失敗，實際：${dc.rules.join(', ') || '通過'}`,
      );
    }

    if (fixture.depcruise !== null && !checkedExitCode) {
      checkedExitCode = true;
      const err = run(depcruiseBin, ['src', '--config', '.dependency-cruiser.cjs']);
      if (err.status === 0) problems.push('depcruise 預設輸出對違規應以非 0 exit code 結束');
    }

    console.log(`${problems.length === 0 ? 'PASS' : 'FAIL'}  ${fixture.name}`);
    for (const p of problems) {
      console.log(`      ${p}`);
      failures.push(`${fixture.name}: ${p}`);
    }
  } finally {
    rmSync(targetPath, { force: true });
  }
}

if (failures.length > 0) {
  console.error(`\n邊界驗證失敗：${String(failures.length)} 項`);
  process.exit(1);
}
console.log(`\n邊界驗證通過：${String(files.length)} 個 fixture（違規全部被擋，control 全部放行）`);
