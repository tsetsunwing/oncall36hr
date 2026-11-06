import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Engine 必須確定性、無 I/O（implementation-plan §3、§17 R12）。
 * 以下禁令同 .dependency-cruiser.cjs 嘅 import 邊界互相補足；
 * `npm run boundaries:verify` 會故意寫入違規檔案，確認兩邊都會失敗。
 */
const engineBannedGlobals = [
  'Date',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'window',
  'document',
  'navigator',
  'globalThis',
  'self',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'queueMicrotask',
  'crypto',
  'performance',
].map((name) => ({
  name,
  message: `engine 內禁止使用 ${name}：engine 必須確定性且無 I/O。時間來自 TICK 事件，隨機來自分流 seeded RNG。`,
}));

const engineBannedProperties = [
  ['Math', 'random'],
  ['Date', 'now'],
  ['performance', 'now'],
  ['crypto', 'getRandomValues'],
  ['crypto', 'randomUUID'],
].map(([object, property]) => ({
  object,
  property,
  message: `engine 內禁止 ${object}.${property}：請用分流 seeded RNG／TICK 時間。`,
}));

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      'tests/boundary-fixtures',
      '.dependency-cruiser.cjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
    },
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['src/**/*.tsx'],
  },
  {
    files: [
      'scripts/**/*.{ts,mjs}',
      'test-support/**/*.ts',
      'e2e/**/*.ts',
      'vite-plugins/**/*.ts',
      '*.ts',
      '*.js',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.es2022 } },
    rules: {
      'no-restricted-globals': ['error', ...engineBannedGlobals],
      'no-restricted-properties': ['error', ...engineBannedProperties],
      'no-restricted-syntax': [
        'error',
        {
          selector: "VariableDeclarator[init.name='Math'] > ObjectPattern",
          message: 'engine 內禁止解構 Math（會繞過 Math.random 禁令）。',
        },
        {
          selector: "MemberExpression[computed=true][object.name='Math']",
          message: 'engine 內禁止以計算屬性存取 Math。',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(@/|(\\.\\./)+)(ai|ui|view|app|storage)(/|$)',
              message:
                'engine 不可 import ai／ui／view／app／storage（模組邊界，見 implementation-plan §3）。',
            },
            {
              group: ['react', 'react-dom', 'react-dom/*', 'react/*', 'idb'],
              message: 'engine 必須係純 TypeScript，不可依賴 React／瀏覽器儲存。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
