import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
const execute = promisify(execFile);
const probe = fileURLToPath(
  new URL('./fixtures/audio-stream-probe.mjs', import.meta.url),
);
it.each([
  ['missing', 'full'],
  ['directory', 'full'],
  ['empty', 'full'],
  ['read-error', 'full'],
  ['read-error', 'range'],
  ['cancel', 'full'],
  ['cancel', 'range'],
])(
  'isolates %s audio failure (%s) without losing other rooms or file handles',
  async (scenario, range) => {
    const { stdout } = await execute(
      process.execPath,
      [probe, scenario, range],
      {
        windowsHide: true,
        timeout: 15000,
      },
    );
    const report = JSON.parse(stdout) as {
      health: number;
      otherRoomUnchanged: boolean;
      laterAudioValid: boolean;
      sourceClosed: boolean;
    };
    expect(report).toMatchObject({
      health: 200,
      otherRoomUnchanged: true,
      laterAudioValid: true,
    });
    if (scenario === 'read-error' || scenario === 'cancel')
      expect(report.sourceClosed).toBe(true);
  },
  20000,
);
