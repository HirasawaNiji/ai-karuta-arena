import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadDownloadedMaterials } from '@amp/server';

const calls = vi.hoisted(() => [] as string[][]);
vi.mock('node:child_process', () => ({
  execFile: (
    _file: string,
    args: string[],
    _options: unknown,
    cb: (error: Error | null, stdout: string, stderr: string) => void,
  ) => {
    calls.push(args);
    void import('node:fs/promises')
      .then(({ writeFile }) => writeFile(args.at(-1)!, 'ten-second-question'))
      .then(() => cb(null, '', ''));
  },
}));
const directories: string[] = [];
afterEach(async () => {
  calls.length = 0;
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'amp-download-'));
  directories.push(dir);
  const audio = Buffer.from('thirty-second-source');
  await writeFile(join(dir, 'S001.mp3'), audio);
  const record = {
    id: 'S001',
    title: 'Song',
    artists: ['Artist'],
    tagIds: ['lang:zh', 'genre:rock'],
    sourceSongId: '123',
    sourceAlbumId: '456',
    sourceReference: 'https://music.163.com/#/song?id=123',
    file: 'S001.mp3',
    audioSha256: createHash('sha256').update(audio).digest('hex'),
    bytes: audio.length,
    audioDurationMs: 30041,
    introDurationMs: 30000,
    recordingDurationMs: 180000,
    retrievedAt: '2026-10-04T00:00:00Z',
    verification: 'exact-platform-id-full-source-zero-start-decode',
  };
  const load = async (
    records: unknown[],
    schemaVersion = 'netease-intros-v1',
  ) => {
    await writeFile(
      join(dir, 'materials.json'),
      JSON.stringify({
        schemaVersion,
        taxonomy: [
          { id: 'lang:zh', label: '国语', dimension: 'languages' },
          { id: 'genre:rock', label: '摇滚', dimension: 'genres' },
        ],
        records,
      }),
    );
    return loadDownloadedMaterials({
      manifestPath: join(dir, 'materials.json'),
      directory: dir,
      cacheDirectory: join(dir, 'cache'),
      ffmpeg: 'must-not-execute',
    });
  };
  return { dir, record, load };
}
it('uses the first ten seconds of a 30-second source and preserves taxonomy/answer mapping', async () => {
  const { record, load } = await fixture();
  const result = await load([record]);
  expect(result.catalog.questions[0]).toMatchObject({
    startMs: 0,
    durationMs: 10000,
    answerCardId: 'card:S001',
    songId: 'S001',
  });
  expect(result.catalog.audioAssets[0]?.durationMs).toBe(30000);
  expect(result.catalog.songs[0]).toMatchObject({
    genres: ['genre:rock'],
    languages: ['lang:zh'],
  });
  expect(calls[0]?.[calls[0].indexOf('-t') + 1]).toBe('10');
  expect(calls[0]).toContain('-map_metadata');
  expect(
    await readFile(result.questionAudioFiles.values().next().value!, 'utf8'),
  ).toBe('ten-second-question');
});
it.each([
  { introDurationMs: 10000 },
  { audioDurationMs: 29000 },
  { verification: 'trial-source' },
  { file: '../S001.mp3' },
  { sourceReference: 'https://example.com' },
])(
  'rejects invalid provenance before exposing a question: %j',
  async (change) => {
    const { record, load } = await fixture();
    await expect(load([{ ...record, ...change }])).rejects.toThrow(
      'provenance',
    );
    expect(calls).toHaveLength(0);
  },
);
it('rejects changed bytes and duplicate platform recordings', async () => {
  const { dir, record, load } = await fixture();
  await expect(load([record, record])).rejects.toThrow('provenance');
  await writeFile(join(dir, 'S001.mp3'), 'changed');
  await expect(load([record])).rejects.toThrow('bytes changed');
});
it('retains an unknown language for instrumentals without inventing a language preference', async () => {
  const { record, load } = await fixture();
  const result = await load([{ ...record, tagIds: ['genre:rock'] }]);
  expect(result.catalog.songs[0]?.languages).toEqual(['lang:unknown']);
});
it('reuses immutable clips on restart and rejects corrupt cache bytes', async () => {
  const { record, load } = await fixture();
  const first = await load([record]);
  const second = await load([record]);
  expect(calls).toHaveLength(1);
  expect(second.questionAudioFiles).toEqual(first.questionAudioFiles);
  await writeFile(first.questionAudioFiles.values().next().value!, 'corrupt');
  await expect(load([record])).rejects.toThrow('cache bytes changed');
});

const youtubeSource = {
  sourcePlatform: 'youtube',
  sourceSongId: 'Eax2zhVA0Zo',
  sourceAlbumId: undefined,
  sourceChannelId: 'UC2jp9Hgdcsm506i8HiNvO4g',
  sourceReference: 'https://www.youtube.com/watch?v=Eax2zhVA0Zo',
  sourceAlbum: 'Arcaea Sound Collection: Memories of Conflict',
  sourceReview:
    'Artist and original game-length album verified in label metadata',
  sourceTrust: 'label-or-artist',
  sourceStartMs: 0,
  sourceDurationMs: 141000,
  verification: 'reviewed-platform-metadata-original-intro-decode',
};
it('accepts reviewed alternate-platform intros without inventing NetEase IDs or album IDs', async () => {
  const { record, load } = await fixture();
  const result = await load(
    [{ ...record, ...youtubeSource }],
    'downloaded-intros-v2',
  );
  expect(result.catalog.songs[0]?.source).toBe('youtube-reviewed-recording');
  expect(result.catalog.audioAssets[0]?.usage.source).toBe(
    youtubeSource.sourceReference,
  );
  expect(result.catalog.recordings[0]?.versionLabel).toContain(
    youtubeSource.sourceAlbum,
  );
  expect(result.catalog.questions[0]?.startMs).toBe(0);
  expect(result.catalog.questions[0]?.durationMs).toBe(10000);
});
it.each([
  { sourcePlatform: 'unknown' },
  { sourceChannelId: '' },
  { sourceReference: 'https://example.com/watch?v=Eax2zhVA0Zo' },
  { sourceReview: '' },
  { sourceTrust: 'assumed-official' },
  { sourceAlbum: '' },
  { sourceStartMs: -1 },
  { sourceStartMs: 120000 },
  { sourceDurationMs: Number.NaN },
  { audioDurationMs: Number.NaN },
  { verification: 'exact-platform-id-full-source-zero-start-decode' },
])(
  'rejects incomplete or mislabeled alternate provenance: %j',
  async (change) => {
    const { record, load } = await fixture();
    await expect(
      load(
        [{ ...record, ...youtubeSource, ...change }],
        'downloaded-intros-v2',
      ),
    ).rejects.toThrow('provenance');
    expect(calls).toHaveLength(0);
  },
);
it('binds the 5sing original to its author and forbids nonzero previews', async () => {
  const { record, load } = await fixture();
  const author = {
    ...record,
    ...youtubeSource,
    sourcePlatform: '5sing',
    sourceSongId: '2893264',
    sourceChannelId: '18397096',
    sourceReference: 'https://5sing.kugou.com/yc/2893264.html',
    sourceTrust: 'author-original',
  };
  const result = await load([author], 'downloaded-intros-v2');
  expect(result.catalog.songs[0]?.source).toBe('5sing-reviewed-recording');
  for (const change of [
    { sourceChannelId: '' },
    { sourceStartMs: 30000 },
    { sourceTrust: 'community-upload' },
  ])
    await expect(
      load([{ ...author, ...change }], 'downloaded-intros-v2'),
    ).rejects.toThrow('provenance');
});
it('does not allow the legacy manifest to silently relabel an alternate recording', async () => {
  const { record, load } = await fixture();
  await expect(load([{ ...record, ...youtubeSource }])).rejects.toThrow(
    'provenance',
  );
  const result = await load(
    [{ ...record, sourcePlatform: 'netease' }],
    'downloaded-intros-v2',
  );
  expect(result.catalog.songs[0]?.source).toBe('netease-exact-recording');
});
