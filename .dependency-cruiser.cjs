/**
 * 模組邊界（implementation-plan §3「邊界強制」）。任何 error 級違規令 `npm run deps:check` 失敗，CI 會擋。
 * 層次：engine ← (ai 只可 import engine 型別) ← view ← ui；storage、content 為葉層；app 為組裝根。
 */
const SRC = '^src';
const test = '\\.test\\.tsx?$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'engine-no-outward-imports',
      severity: 'error',
      comment: 'engine 不可 import ai／ui／view／app／storage／測試支援。',
      from: { path: `${SRC}/engine/` },
      to: { path: `^(${'src'}/(ai|ui|view|app|storage)/|test-support/|e2e/|scripts/)` },
    },
    {
      name: 'engine-no-ui-or-io-packages',
      severity: 'error',
      comment: 'engine 必須係純 TS：不可依賴 React、zustand、idb。',
      from: { path: `${SRC}/engine/` },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'],
        path: '(^|/)node_modules/(react|react-dom|zustand|idb)(/|$)',
      },
    },
    {
      name: 'ai-only-engine-types',
      severity: 'error',
      comment: 'ai 只可 import engine 嘅型別（import type），唔可 import reducer 等 runtime。',
      from: { path: `${SRC}/ai/` },
      to: { path: `${SRC}/engine/`, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'ai-no-ui-view-storage-app',
      severity: 'error',
      from: { path: `${SRC}/ai/` },
      to: { path: `${SRC}/(ui|view|storage|app)/` },
    },
    {
      name: 'ui-only-view-storage',
      severity: 'error',
      comment:
        'ui 只可 import view、storage、i18n、content 設定同 ui 自己；唔可碰 engine／ai／app。',
      from: { path: `${SRC}/ui/` },
      to: { path: `${SRC}/(engine|ai|app)/` },
    },
    {
      name: 'view-no-ui-ai-app',
      severity: 'error',
      from: { path: `${SRC}/view/` },
      to: { path: `${SRC}/(ui|ai|app)/` },
    },
    {
      name: 'storage-no-ui-view-ai-app',
      severity: 'error',
      from: { path: `${SRC}/storage/` },
      to: { path: `${SRC}/(ui|view|ai|app)/` },
    },
    {
      name: 'storage-engine-types-only',
      severity: 'error',
      from: { path: `${SRC}/storage/` },
      to: { path: `${SRC}/engine/`, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'content-is-pure-data',
      severity: 'error',
      comment: 'content 係純 data＋zod schema：唔可 import 任何其他 src 層。',
      from: { path: `${SRC}/content/` },
      to: { path: `${SRC}/(engine|ai|ui|view|storage|app|i18n)/` },
    },
    {
      name: 'content-only-zod',
      severity: 'error',
      from: { path: `${SRC}/content/`, pathNot: test },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional'],
        pathNot: '(^|/)node_modules/zod(/|$)',
      },
    },
    {
      name: 'i18n-leaf',
      severity: 'error',
      from: { path: `${SRC}/i18n/` },
      to: { path: `${SRC}/(engine|ai|ui|view|storage|app|content)/` },
    },
    {
      name: 'nothing-imports-app',
      severity: 'error',
      comment: 'app 係組裝根，只可被入口使用。',
      from: { path: `${SRC}/`, pathNot: `${SRC}/app/` },
      to: { path: `${SRC}/app/` },
    },
    {
      name: 'src-no-test-support',
      severity: 'error',
      comment: 'mock AI server 等測試支援唔可進 production bundle。',
      from: { path: `${SRC}/`, pathNot: test },
      to: { path: '^(test-support|e2e|scripts|tests|vite-plugins)/' },
    },
    {
      name: 'src-no-dev-dependencies',
      severity: 'error',
      from: { path: `${SRC}/`, pathNot: `${test}|^src/test/|\\.d\\.ts$` },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
