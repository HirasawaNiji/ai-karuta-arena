import js from '@eslint/js';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/.local/**',
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/coverage/**',
      'output/playwright/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.test.json',
          './packages/core/tsconfig.json',
          './packages/music-profile/tsconfig.json',
          './packages/adapters/tsconfig.json',
          './packages/playlist-engine/tsconfig.json',
          './packages/party-runtime/tsconfig.json',
          './apps/demo/tsconfig.json',
          './apps/server/tsconfig.json',
          './apps/web/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@amp/(?!adapters/fixtures$)[^/]+/',
              message:
                'Import workspace packages through their public exports.',
            },
            {
              group: ['**/apps/**', '**/packages/*/src/**', '**/src/**'],
              message: 'Import public workspace exports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/music-profile/src/**/*.ts',
      'packages/adapters/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@amp/(?!core$)',
              message:
                'Profile and adapters depend only on the core public export.',
            },
            {
              group: ['**/apps/**', '**/packages/**', '**/src/**'],
              message: 'Do not bypass workspace package boundaries.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/music-profile/src/**/*.ts',
      'packages/playlist-engine/src/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({
            name,
            message: 'Pure domain calculations have no I/O.',
          })),
          patterns: [
            {
              regex: '^@amp/(?!core$)',
              message: 'Pure domain calculations depend only on core.',
            },
            {
              group: ['node:*', '**/apps/**', '**/packages/**', '**/src/**'],
              message:
                'Pure domain calculations have no I/O or cross-package source imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'process', 'require'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Use static public dependencies.',
        },
      ],
    },
  },
  {
    files: ['packages/party-runtime/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({
            name,
            message: 'Runtime injects I/O ports.',
          })),
          patterns: [
            {
              regex: '^@amp/(?!core$|music-profile$|playlist-engine$)',
              message: 'Runtime injects adapters through core ports.',
            },
            {
              group: ['node:*', '**/apps/**', '**/packages/**', '**/src/**'],
              message: 'Use public domain exports.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'process', 'require'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Use static public dependencies.',
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^@amp/(?!core$)',
              message:
                'Web uses public core contracts only; I/O adapters stay on the server.',
            },
            {
              group: ['**/server/**', '**/packages/**'],
              message: 'Do not import server or domain internals into web.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: builtinModules.map((name) => ({
            name,
            message: 'Core cannot use Node I/O.',
          })),
          patterns: [
            {
              group: [
                '@amp/*',
                'node:*',
                '../**',
                '**/apps/**',
                '**/packages/**',
              ],
              message:
                'Core must not depend on applications, other domain packages or Node I/O.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'process', 'require'],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Core uses static, reviewable dependencies only.',
        },
      ],
    },
  },
);
