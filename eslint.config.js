// Flat ESLint config. Two jobs beyond correctness:
// 1. enforce the dependency direction app → pages → widgets → features → entities → shared
// 2. make localStorage/sessionStorage unreachable outside src/shared/lib/cache.ts
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const LAYER_ORDER = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];

/** Modules a file in `layer` may NOT import (relative to src/). */
function forbiddenFor(layer) {
  const index = LAYER_ORDER.indexOf(layer);
  // A layer may depend on itself, the layers below it, domain and config.
  return LAYER_ORDER.slice(0, index).map((name) => `@/${name}`);
}

function layerRule(layer) {
  const forbidden = forbiddenFor(layer);
  if (forbidden.length === 0) return null;
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: forbidden.flatMap((path) => [
            {
              group: [path, `${path}/*`],
              message: `Dependency direction violation: ${layer} may not import ${path}. Allowed direction is app → pages → widgets → features → entities → shared (plus domain and config).`,
            },
          ]),
        },
      ],
    },
  };
}

const storageGlobals = [
  {
    name: 'localStorage',
    message:
      'Only src/shared/lib/cache.ts may touch localStorage. Use the cache API so keys stay namespaced.',
  },
  {
    name: 'sessionStorage',
    message:
      'Only src/shared/lib/cache.ts may touch sessionStorage. Use the cache API so keys stay namespaced.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-*',
      'coverage',
      'node_modules',
      'playwright-report',
      'test-results',
      '.research',
      'docs',
      'src/config/errors.generated.ts',
      'src/config/build-id.generated.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-restricted-globals': ['error', ...storageGlobals],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: storageGlobals[0].message },
        { object: 'window', property: 'sessionStorage', message: storageGlobals[1].message },
        { object: 'globalThis', property: 'localStorage', message: storageGlobals[0].message },
        { object: 'globalThis', property: 'sessionStorage', message: storageGlobals[1].message },
      ],
    },
  },
  {
    // The single storage boundary is allowed to use the web storage APIs.
    files: ['src/shared/lib/cache.ts'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    // domain/ is plain TypeScript: no React, no browser globals, no chain SDKs.
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react/*',
                'react-dom/*',
                'wagmi',
                'wagmi/*',
                'viem',
                'viem/*',
                '@tanstack/*',
                '@/*',
              ],
              message:
                'src/domain is pure TypeScript and must not depend on React, the browser, or chain libraries.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/domain must stay platform independent.' },
        { name: 'document', message: 'src/domain must stay platform independent.' },
        { name: 'location', message: 'src/domain must stay platform independent.' },
        ...storageGlobals,
      ],
    },
  },
  {
    files: ['src/config/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/app',
                '@/app/*',
                '@/pages',
                '@/pages/*',
                '@/widgets',
                '@/widgets/*',
                '@/features',
                '@/features/*',
                '@/entities',
                '@/entities/*',
                '@/shared',
                '@/shared/*',
                '@/domain',
                '@/domain/*',
              ],
              message: 'src/config is a leaf package: data only, consumed by every layer.',
            },
          ],
        },
      ],
    },
  },
  layerRule('pages'),
  layerRule('widgets'),
  layerRule('features'),
  layerRule('entities'),
  layerRule('shared'),
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
