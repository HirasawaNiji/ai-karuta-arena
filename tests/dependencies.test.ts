import { ESLint } from 'eslint';
import { expect, it } from 'vitest';

it('enforces core independence and public workspace exports', async () => {
  // lintText probes replace an existing file in memory. CI's single-run parser
  // optimization reads immutable disk programs instead, so disable it for this
  // reusable ESLint instance; keep every production rule and project unchanged.
  const eslint = new ESLint({
    overrideConfig: {
      languageOptions: {
        parserOptions: { disallowAutomaticSingleRunInference: true },
      },
    },
  });
  for (const dependency of [
    '@amp/party-runtime',
    '@amp/adapters',
    'node:fs',
    '../../apps/demo',
  ]) {
    const results = await eslint.lintText(`import '${dependency}';`, {
      filePath: 'packages/core/src/index.ts',
    });
    expect(
      results
        .flatMap((result) => result.messages)
        .some((message) => message.ruleId === 'no-restricted-imports'),
      JSON.stringify({
        dependency,
        diagnostics: results.flatMap((result) => result.messages),
      }),
    ).toBe(true);
  }
  const invalid = await eslint.lintText("import '@amp/core/src/song.js';", {
    filePath: 'tests/core.test.ts',
  });
  expect(invalid[0]?.errorCount).toBeGreaterThan(0);
  const valid = await eslint.lintText("import '@amp/core';", {
    filePath: 'tests/core.test.ts',
  });
  expect(valid[0]?.errorCount).toBe(0);
}, 30_000);
