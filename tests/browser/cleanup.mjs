import { rm } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import process from 'node:process';

export function materialDirectory() {
  const value = process.env.AMP_BROWSER_MATERIAL_DIR;
  if (!value) throw new Error('Missing browser fixture directory');
  const directory = resolve(value);
  if (
    dirname(directory) !== resolve('output/playwright') ||
    !/^audio-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      basename(directory),
    )
  )
    throw new Error('Unsafe browser fixture directory');
  return directory;
}

// Runner teardown also works when Windows force-kills the web-server process.
export default async function cleanup() {
  await rm(materialDirectory(), { recursive: true, force: true });
}
