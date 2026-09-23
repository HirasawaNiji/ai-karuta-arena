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
        project: ['./tsconfig.test.json', './packages/core/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@amp/*/*', '**/apps/**', '**/packages/*/src/**'],
              message:
                'Import workspace packages through their public exports.',
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
