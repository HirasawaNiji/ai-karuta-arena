import { afterEach, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadPendingMaterials, loadReviewedMaterials } from '@amp/server';
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
