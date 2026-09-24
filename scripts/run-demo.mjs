import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
const root = fileURLToPath(new URL('../', import.meta.url));
// A fresh checkout has no dist. Keep build output away from JSON stdout.
const build = spawnSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-b'],
  { cwd: root, encoding: 'utf8' },
);
if (build.stdout) process.stderr.write(build.stdout);
if (build.stderr) process.stderr.write(build.stderr);
if (build.error || build.status !== 0) {
  process.stderr.write(
    'Demo build failed. Run pnpm install with the documented Node version.\n',
  );
  process.exitCode = build.status ?? 1;
} else {
  const demo = spawnSync(
    process.execPath,
    ['apps/demo/dist/cli.js', ...process.argv.slice(2)],
    { cwd: root, stdio: 'inherit' },
  );
  if (demo.error) process.stderr.write('Demo process failed to start.\n');
  process.exitCode = demo.status ?? 1;
}
