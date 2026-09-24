import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const pnpm = process.env.npm_execpath;
assert(
  pnpm,
  'Run via pnpm demo:check so the pinned package manager is available',
);
// Deliberately omit all platform/model credentials, proxies and NODE_OPTIONS.
const allowed = new Set([
  'path',
  'systemroot',
  'windir',
  'comspec',
  'pathext',
  'temp',
  'tmp',
  'home',
  'userprofile',
  'appdata',
  'localappdata',
  'pnpm_home',
]);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    allowed.has(name.toLowerCase()),
  ),
);
function execute(args) {
  return spawnSync(process.execPath, [pnpm, 'demo', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 120000,
  });
}
const all = execute(['--', '--format', 'json']);
assert.equal(all.status, 0, all.stderr);
assert.equal(all.stderr, '');
const bundle = JSON.parse(all.stdout);
assert.deepEqual(
  bundle.reports.map((r) => r.scenarioId),
  ['mixed', 'stress', 'ban', 'feedback'],
);
for (const expected of bundle.reports) {
  const result = execute([
    '--',
    '--scenario',
    expected.scenarioId,
    '--format',
    'json',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), {
    schemaVersion: 1,
    reports: [expected],
  });
}
const text = execute([]);
assert.equal(text.status, 0, text.stderr);
assert.match(text.stdout, /AI 音乐派对/);
assert.match(text.stdout, /simulated_host/);
for (const args of [
  ['--scenario', 'unknown'],
  ['--format', 'xml'],
  ['--scenario'],
]) {
  const bad = execute(args);
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /Invalid/);
}
// Direct unexpected failures must not emit a successful-looking partial JSON report.
const failed = spawnSync(
  process.execPath,
  [
    '--input-type=module',
    '-e',
    "import {runCli} from '@amp/demo'; process.exitCode=await runCli(['--format','json'],{stdout:s=>process.stdout.write(s),stderr:s=>process.stderr.write(s)},async()=>{throw new Error('controlled failure');});",
  ],
  { cwd: root, env, encoding: 'utf8' },
);
assert.equal(failed.status, 1);
assert.match(failed.stderr, /Demo failed: controlled failure/);
assert.equal(failed.stdout, '');
process.stdout.write(
  'Demo process checks passed: all scenarios, per-scenario JSON, text, invalid arguments, no credential environment.\n',
);
