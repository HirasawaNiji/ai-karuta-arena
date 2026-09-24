import js from '@eslint/js';
import { builtinModules } from 'node:module';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.test.json',
          './packages/core/tsconfig.json',
          './packages/music-profile/tsconfig.json',
          './packages/adapters/tsconfig.json',
          './packages/playlist-engine/tsconfig.json',
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
