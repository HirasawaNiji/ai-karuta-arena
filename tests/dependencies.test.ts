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

it('enforces new package ownership and permits only the documented fixture subpath', async () => {
  const eslint = new ESLint({
    overrideConfig: {
      languageOptions: {
        parserOptions: { disallowAutomaticSingleRunInference: true },
      },
    },
  });
  for (const [file, dependency] of [
    ['packages/music-profile/src/index.ts', '@amp/adapters'],
    ['packages/music-profile/src/index.ts', '@amp/adapters/fixtures'],
    ['packages/music-profile/src/index.ts', 'node:fs'],
    ['packages/adapters/src/index.ts', '@amp/music-profile'],
    ['packages/music-profile/src/index.ts', '../../core/src/index.js'],
    ['packages/adapters/src/index.ts', '../../music-profile/src/index.js'],
    ['tests/music-profile.test.ts', '../packages/core/src/index.js'],
    ['tests/music-profile.test.ts', '@amp/adapters/fixtures/private'],
    ['tests/music-profile.test.ts', '@amp/core/src/index.js'],
  ]) {
    const results = await eslint.lintText("import '" + dependency + "';", {
      filePath: file!,
    });
    expect(
      results
        .flatMap((r) => r.messages)
        .some((m) => m.ruleId === 'no-restricted-imports'),
      dependency,
    ).toBe(true);
  }
  for (const [file, dependency] of [
    ['packages/music-profile/src/index.ts', '@amp/core'],
    ['packages/adapters/src/index.ts', '@amp/core'],
    ['tests/music-profile.test.ts', '@amp/adapters/fixtures'],
  ]) {
    const results = await eslint.lintText("import '" + dependency + "';", {
      filePath: file!,
    });
    expect(results[0]?.errorCount).toBe(0);
  }
}, 30000);

it('keeps playlist-engine independent of profile calculations, adapters and I/O', async () => {
  const eslint = new ESLint({
    overrideConfig: {
      languageOptions: {
        parserOptions: { disallowAutomaticSingleRunInference: true },
      },
    },
  });
  for (const dependency of [
    '@amp/music-profile',
    '@amp/adapters/fixtures',
    '@amp/party-runtime',
    'node:fs',
    '../../music-profile/src/index.js',
  ]) {
    const results = await eslint.lintText("import '" + dependency + "';", {
      filePath: 'packages/playlist-engine/src/index.ts',
    });
    expect(
      results
        .flatMap((r) => r.messages)
        .some((m) => m.ruleId === 'no-restricted-imports'),
      dependency,
    ).toBe(true);
  }
  const valid = await eslint.lintText("import '@amp/core';", {
    filePath: 'packages/playlist-engine/src/index.ts',
  });
  expect(valid[0]?.errorCount).toBe(0);
}, 30000);

it('keeps runtime adapters injected through core ports', async () => {
  const eslint = new ESLint({
    overrideConfig: {
      languageOptions: {
        parserOptions: { disallowAutomaticSingleRunInference: true },
      },
    },
  });
  for (const dependency of [
    '@amp/adapters',
    '@amp/adapters/fixtures',
    'node:fs',
    '../../adapters/src/index.js',
  ]) {
    const results = await eslint.lintText("import '" + dependency + "';", {
      filePath: 'packages/party-runtime/src/index.ts',
    });
    expect(
      results
        .flatMap((r) => r.messages)
        .some((m) => m.ruleId === 'no-restricted-imports'),
    ).toBe(true);
  }
  for (const dependency of [
    '@amp/core',
    '@amp/music-profile',
    '@amp/playlist-engine',
  ]) {
    const results = await eslint.lintText("import '" + dependency + "';", {
      filePath: 'packages/party-runtime/src/index.ts',
    });
    expect(results[0]?.errorCount).toBe(0);
  }
}, 30000);
