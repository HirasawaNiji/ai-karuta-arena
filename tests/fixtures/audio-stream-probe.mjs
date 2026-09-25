/* global fetch, AbortSignal */
// A separate process makes an unhandled stream error fail this probe, not the test worker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, writeFile, unlink, mkdir, rm } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { get } from 'node:http';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '@amp/server';
import { createMixedFixture } from '@amp/adapters/fixtures';

const [scenario, rangeMode] = process.argv.slice(2);
assert.ok(
  ['missing', 'directory', 'empty', 'read-error', 'cancel'].includes(scenario),
);
const range = rangeMode === 'range';
const dir = await mkdtemp(join(tmpdir(), 'amp-stream-probe-'));
assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep));
const target = join(dir, 'changing.mp3'),
  good = join(dir, 'good.mp3');
await writeFile(target, '0123456789');
await writeFile(good, 'abcdefghij');
let source,
  sourceClosed = false,
  releaseRead;
let observeFirstChunk;
const readGate = new Promise((resolve) => {
  releaseRead = resolve;
});
const firstChunk = new Promise((resolve) => {
  observeFirstChunk = resolve;
});
const originalCreateReadStream = fs.createReadStream;
if (scenario === 'read-error' || scenario === 'cancel') {
  fs.createReadStream = (path, options) => {
    if (path !== target) return originalCreateReadStream(path, options);
    let reads = 0;
    source = originalCreateReadStream(path, {
      ...options,
      highWaterMark: 2,
      fs: {
        open: fs.open,
        close: fs.close,
        read(fd, buffer, offset, length, position, callback) {
          if (reads++ === 0)
            return fs.read(fd, buffer, offset, length, position, callback);
          if (scenario === 'read-error') {
            void firstChunk.then(() =>
              callback(
                Object.assign(new Error('controlled I/O failure'), {
                  code: 'EIO',
                }),
              ),
            );
          } else {
            void readGate.then(() =>
              fs.read(fd, buffer, offset, length, position, callback),
            );
          }
        },
      },
    });
    source.once('close', () => {
      sourceClosed = true;
    });
    return source;
  };
  syncBuiltinESMExports();
}
const app = createApp({
  catalog: createMixedFixture().catalog,
  mediaFiles: new Map([
    ['changing', target],
    ['good', good],
  ]),
});
app.server.on('request', (req, res) => {
  if (req.url === '/api/materials/changing/audio')
    res.once('close', () => releaseRead());
});
let base;
async function request(path, cookie = '', body) {
  return fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  }).catch((error) => {
    throw new Error('Probe request failed: ' + path, { cause: error });
  });
}
async function create(nickname) {
  const response = await request('/api/rooms', '', { nickname });
  assert.equal(response.status, 201);
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    entry: await response.json(),
  };
}
function audio(cookie) {
  return new Promise((resolve) => {
    let received = 0,
      status = null;
    const req = get(
      base + '/api/materials/changing/audio',
      {
        headers: { Cookie: cookie, ...(range ? { Range: 'bytes=2-7' } : {}) },
      },
      (res) => {
        status = res.statusCode;
        res.on('data', (chunk) => {
          received += chunk.length;
          observeFirstChunk();
          if (scenario === 'cancel') req.destroy();
        });
        res.on('end', () => resolve({ complete: true, status, received }));
        res.on('aborted', () => resolve({ complete: false, status, received }));
        res.on('error', (error) =>
          resolve({ complete: false, status, received, code: error.code }),
        );
      },
    );
    req.setTimeout(5000, () =>
      req.destroy(
        Object.assign(new Error('request deadline exceeded'), {
          code: 'PROBE_TIMEOUT',
        }),
      ),
    );
    req.on('error', (error) =>
      resolve({ complete: false, status, received, code: error.code }),
    );
  });
}
try {
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + app.server.address().port;
  const host = await create('Audio probe'),
    other = await create('Independent room');
  const before = await (await request('/api/state', other.cookie)).json();
  if (scenario === 'directory' || scenario === 'missing') {
    await unlink(target);
    if (scenario === 'directory') await mkdir(target);
  } else if (scenario === 'empty') await writeFile(target, '');
  let outcome;
  if (['directory', 'missing', 'empty'].includes(scenario)) {
    const response = await request(
      '/api/materials/changing/audio',
      host.cookie,
    );
    outcome = { status: response.status, body: await response.json() };
    assert.deepEqual(outcome, {
      status: 404,
      body: { error: '音频文件不可用' },
    });
  } else {
    outcome = await audio(host.cookie);
    assert.notEqual(outcome.code, 'PROBE_TIMEOUT');
    assert.equal(outcome.complete, false);
    assert.equal(outcome.status, range ? 206 : 200);
    assert.ok(outcome.received > 0 && outcome.received < (range ? 6 : 10));
    const deadline = Date.now() + 2000;
    while (!sourceClosed && Date.now() < deadline) await delay(10);
    assert.ok(
      sourceClosed && source.closed && source.destroyed,
      'audio source must close after failure or cancellation',
    );
  }
  assert.equal((await request('/api/health')).status, 200);
  const after = await (await request('/api/state', other.cookie)).json();
  assert.deepEqual(after, before);
  const next = await request('/api/materials/good/audio', host.cookie);
  assert.equal(next.status, 200);
  assert.deepEqual(
    Buffer.from(await next.arrayBuffer()),
    Buffer.from('abcdefghij'),
  );
  process.stdout.write(
    JSON.stringify({
      scenario,
      range,
      outcome,
      sourceClosed,
      health: 200,
      otherRoomUnchanged: true,
      laterAudioValid: true,
    }) + String.fromCharCode(10),
  );
} finally {
  releaseRead();
  source?.destroy();
  await app.close();
  fs.createReadStream = originalCreateReadStream;
  syncBuiltinESMExports();
  await rm(dir, { recursive: true, force: true });
}
