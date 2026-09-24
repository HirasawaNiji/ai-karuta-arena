import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
  open,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { loadPendingMaterials, loadReviewedMaterials } from '@amp/server';
const transcodes = vi.hoisted(
  () =>
    [] as {
      output: string;
      complete: (error: Error | null) => void;
    }[],
);
vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: unknown,
    callback: (error: Error | null) => void,
  ) => {
    transcodes.push({ output: args.at(-1)!, complete: callback });
  },
}));
beforeEach(() => {
  transcodes.length = 0;
});
const files: string[] = [];
afterEach(async () => {
  for (const file of files.splice(0))
    await rm(file, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'amp-review-'));
  files.push(dir);
  const bytes = Buffer.from('test-only-not-a-real-audio');
  const sha = createHash('sha256').update(bytes).digest('hex');
  await writeFile(join(dir, 'audio.mp3'), bytes);
  await writeFile(
    join(dir, 'audit.json'),
    JSON.stringify({
      records: [
        {
          sourceTrackId: 'TEST-001',
          title: '测试旋律',
          artist: null,
          audio: {
            member: 'audio.mp3',
            sha256: sha,
            durationMs: 30000,
            bytes: bytes.length,
            decodeOk: true,
          },
          semanticReview: 'pending',
        },
      ],
    }),
  );
  const pending = await loadPendingMaterials(join(dir, 'audit.json'), dir);
  const record = {
    id: 'TEST-001',
    audioSha256: sha,
    title: '测试旋律',
    artists: ['测试音频生成器'],
    languageTag: 'lang:ja',
    recordingVersion: '仅测试',
    sourceReference: '本测试构造的素材',
    reviewedBy: '测试程序',
    reviewedAt: '2026-09-24T00:00:00Z',
    recordingStartsAtZero: true,
    recognitionChecked: true,
    introDurationMs: 10000,
  };
  const load = async (records: unknown[]) => {
    await writeFile(
      join(dir, 'review.json'),
      JSON.stringify({ schemaVersion: 'intro-review-v1', records }),
    );
    return loadReviewedMaterials({
      catalog: pending.catalog,
      files: pending.files,
      manifestPath: join(dir, 'review.json'),
      cacheDirectory: join(dir, 'cache'),
      ffmpeg: 'this-must-not-execute',
    });
  };
  return { pending, record, load, dir };
}
it('does not promote technically available pending files without semantic review', async () => {
  const { pending, load } = await fixture();
  const result = await load([]);
  expect(pending.files.size).toBe(1);
  expect(result.verifiedQuestionIds).toEqual([]);
  expect(result.catalog.questions).toEqual([]);
  expect(result.catalog.audioAssets[0]?.usage.status).toBe('pending');
});
it.each([
  { recordingStartsAtZero: false },
  { recognitionChecked: false },
  { reviewedBy: '' },
  { introDurationMs: 9999 },
  { introDurationMs: 31000 },
  { artists: [] },
  { sourceReference: '' },
])('rejects incomplete or unsupported semantic claim %j', async (change) => {
  const { load, record } = await fixture();
  await expect(load([{ ...record, ...change }])).rejects.toThrow(/核验/);
});
it('binds review to exact bytes and refuses an unrelated language or song', async () => {
  const { load, record } = await fixture();
  await expect(
    load([{ ...record, audioSha256: '0'.repeat(64) }]),
  ).rejects.toThrow(/哈希/);
  await expect(load([{ ...record, languageTag: 'genre:pop' }])).rejects.toThrow(
    /语言/,
  );
  await expect(load([{ ...record, id: 'missing' }])).rejects.toThrow(/匹配/);
});

async function cacheFixture() {
  const { pending, record, dir } = await fixture();
  const manifestPath = join(dir, 'review.json');
  const cacheDirectory = join(dir, 'cache');
  await writeFile(
    manifestPath,
    JSON.stringify({ schemaVersion: 'intro-review-v1', records: [record] }),
  );
  const targetFor = (content: string) =>
    join(
      cacheDirectory,
      record.audioSha256 +
        '-intro-v1-' +
        createHash('sha256').update(content).digest('hex') +
        '.mp3',
    );
  const load = () =>
    loadReviewedMaterials({
      catalog: pending.catalog,
      files: pending.files,
      manifestPath,
      cacheDirectory,
      ffmpeg: 'controlled-test-converter',
    });
  return { cacheDirectory, targetFor, load };
}
async function publish(
  cache: Awaited<ReturnType<typeof cacheFixture>>,
  content: string,
) {
  const index = transcodes.length,
    pending = cache.load();
  await expect.poll(() => transcodes.length).toBe(index + 1);
  await writeFile(transcodes[index]!.output, content);
  transcodes[index]!.complete(null);
  return pending;
}

it('publishes complete new audio while preserving already opened readers and old room paths', async () => {
  const cache = await cacheFixture();
  const initial = await publish(cache, 'old complete audio');
  const oldPath = [...initial.questionAudioFiles.values()][0]!;
  expect(oldPath).toBe(cache.targetFor('old complete audio'));
  const reader = await open(oldPath, 'r');
  try {
    const refreshed = cache.load();
    await expect.poll(() => transcodes.length).toBe(2);
    const newPath = cache.targetFor('new complete audio');
    await writeFile(transcodes[1]!.output, 'partial new');
    expect(await readFile(oldPath, 'utf8')).toBe('old complete audio');
    await expect(readFile(newPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(transcodes[1]!.output, 'new complete audio');
    transcodes[1]!.complete(null);
    const result = await refreshed;
    expect([...result.questionAudioFiles.values()]).toEqual([newPath]);
    expect(await readFile(newPath, 'utf8')).toBe('new complete audio');
    expect(await reader.readFile('utf8')).toBe('old complete audio');
    expect(await readFile(oldPath, 'utf8')).toBe('old complete audio');
    expect((await readdir(cache.cacheDirectory)).sort()).toEqual(
      [basename(oldPath), basename(newPath)].sort(),
    );
  } finally {
    await reader.close();
  }
});

it.each([false, true])(
  'failed conversion preserves published content (existing=%s) and cleans partial output',
  async (existing) => {
    const cache = await cacheFixture();
    if (existing) await publish(cache, 'old complete audio');
    const index = transcodes.length;
    const failed = expect(cache.load()).rejects.toThrow('生成对局音频失败');
    await expect.poll(() => transcodes.length).toBe(index + 1);
    await writeFile(transcodes[index]!.output, 'broken partial');
    transcodes[index]!.complete(new Error('converter failed'));
    await failed;
    if (existing)
      expect(
        await readFile(cache.targetFor('old complete audio'), 'utf8'),
      ).toBe('old complete audio');
    expect(await readdir(cache.cacheDirectory)).toEqual(
      existing ? [basename(cache.targetFor('old complete audio'))] : [],
    );
  },
);

it('isolates concurrent outputs and never exposes either incomplete file', async () => {
  const cache = await cacheFixture();
  const first = cache.load(),
    second = cache.load();
  await expect.poll(() => transcodes.length).toBe(2);
  expect(transcodes[0]!.output).not.toBe(transcodes[1]!.output);
  await writeFile(transcodes[0]!.output, 'first complete');
  await writeFile(transcodes[1]!.output, 'second partial');
  transcodes[0]!.complete(null);
  await expect
    .poll(async () => readFile(cache.targetFor('first complete'), 'utf8'))
    .toBe('first complete');
  await expect(
    readFile(cache.targetFor('second complete')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  await writeFile(transcodes[1]!.output, 'second complete');
  transcodes[1]!.complete(null);
  const results = await Promise.all([first, second]);
  expect(
    new Set(results.flatMap((r) => [...r.questionAudioFiles.values()])),
  ).toEqual(
    new Set([
      cache.targetFor('first complete'),
      cache.targetFor('second complete'),
    ]),
  );
  expect(await readFile(cache.targetFor('first complete'), 'utf8')).toBe(
    'first complete',
  );
  expect(await readFile(cache.targetFor('second complete'), 'utf8')).toBe(
    'second complete',
  );
  expect(
    (await readdir(cache.cacheDirectory)).some((name) =>
      name.includes('.tmp.'),
    ),
  ).toBe(false);
});

it('reuses identical bytes under concurrent refresh while an existing reader holds the file', async () => {
  const cache = await cacheFixture();
  const initial = await publish(cache, 'same complete audio');
  const target = [...initial.questionAudioFiles.values()][0]!;
  const reader = await open(target, 'r');
  try {
    const first = cache.load(),
      second = cache.load();
    await expect.poll(() => transcodes.length).toBe(3);
    for (const converter of transcodes.slice(1)) {
      await writeFile(converter.output, 'same complete audio');
      converter.complete(null);
    }
    const results = await Promise.all([first, second]);
    for (const result of results)
      expect([...result.questionAudioFiles.values()]).toEqual([target]);
    expect(await reader.readFile('utf8')).toBe('same complete audio');
    expect(await readdir(cache.cacheDirectory)).toEqual([basename(target)]);
  } finally {
    await reader.close();
  }
});

it('does not publish empty output even if the converter reports success', async () => {
  const cache = await cacheFixture();
  const failed = expect(cache.load()).rejects.toThrow('生成的对局音频为空');
  await expect.poll(() => transcodes.length).toBe(1);
  await writeFile(transcodes[0]!.output, '');
  transcodes[0]!.complete(null);
  await failed;
  expect(await readdir(cache.cacheDirectory)).toEqual([]);
});

it('rejects corrupt existing content without replacing or trusting it', async () => {
  const cache = await cacheFixture();
  const failed = expect(cache.load()).rejects.toThrow(
    '已有对局音频缓存内容不匹配',
  );
  await expect.poll(() => transcodes.length).toBe(1);
  const target = cache.targetFor('expected complete');
  await writeFile(target, 'corrupt cache');
  await writeFile(transcodes[0]!.output, 'expected complete');
  transcodes[0]!.complete(null);
  await failed;
  expect(await readFile(target, 'utf8')).toBe('corrupt cache');
  expect(await readdir(cache.cacheDirectory)).toEqual([basename(target)]);
});
