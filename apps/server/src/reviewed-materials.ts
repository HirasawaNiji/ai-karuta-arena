import { readFile, mkdir, link, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  CatalogSchema,
  QuestionSchema,
  DUEL_RULES,
  type Catalog,
} from '@amp/core';

/** Trusted local review file only. No browser endpoint can promote pending material. */
export interface MaterialReview {
  schemaVersion: 'intro-review-v1';
  records: {
    id: string;
    audioSha256: string;
    title: string;
    artists: string[];
    languageTag: string;
    recordingVersion: string;
    sourceReference: string;
    reviewedBy: string;
    reviewedAt: string;
    recordingStartsAtZero: true;
    recognitionChecked: true;
    introDurationMs: number;
  }[];
}
export async function loadReviewedMaterials(input: {
  catalog: Catalog;
  files: ReadonlyMap<string, string>;
  manifestPath: string;
  cacheDirectory: string;
  ffmpeg: string;
}): Promise<{
  catalog: Catalog;
  verifiedQuestionIds: string[];
  questionAudioFiles: Map<string, string>;
}> {
  const raw: unknown = JSON.parse(await readFile(input.manifestPath, 'utf8'));
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('schemaVersion' in raw) ||
    raw.schemaVersion !== 'intro-review-v1' ||
    !('records' in raw) ||
    !Array.isArray(raw.records)
  )
    throw new Error('无效的前奏核验清单');
  const records = (raw as MaterialReview).records;
  const ids = new Set<string>();
  let catalog = input.catalog;
  const questionAudioFiles = new Map<string, string>();
  const verifiedQuestionIds: string[] = [];
  await mkdir(input.cacheDirectory, { recursive: true });
  for (const record of records) {
    const nonempty = (v: unknown) =>
      typeof v === 'string' && v.trim().length > 0 && v.length <= 500;
    if (
      !record ||
      !nonempty(record.id) ||
      ids.has(record.id) ||
      !/^[A-Za-z0-9-]+$/.test(record.id) ||
      !/^[a-f0-9]{64}$/.test(record.audioSha256) ||
      ![
        record.title,
        record.recordingVersion,
        record.sourceReference,
        record.reviewedBy,
      ].every(nonempty) ||
      !Array.isArray(record.artists) ||
      !record.artists.length ||
      !record.artists.every(nonempty) ||
      new Set(record.artists).size !== record.artists.length ||
      record.recordingStartsAtZero !== true ||
      record.recognitionChecked !== true ||
      !Number.isFinite(Date.parse(record.reviewedAt)) ||
      !Number.isInteger(record.introDurationMs) ||
      record.introDurationMs < DUEL_RULES.roundMs ||
      record.introDurationMs > 30000
    )
      throw new Error('核验记录不完整或缺少前奏/录音确认');
    ids.add(record.id);
    const song = catalog.songs.find((s) => s.id === record.id);
    const recording = catalog.recordings.find((r) => r.songId === record.id);
    const asset = catalog.audioAssets.find(
      (a) => a.assetId === recording?.audioAssetId,
    );
    const card = catalog.cards.find((c) => c.cardId === 'card:' + record.id);
    const file = input.files.get(record.id);
    if (
      !song ||
      !recording ||
      !asset ||
      !card ||
      !file ||
      asset.durationMs < record.introDurationMs ||
      !catalog.taxonomy.some(
        (t) => t.id === record.languageTag && t.dimension === 'languages',
      )
    )
      throw new Error('核验记录没有匹配的可用音频、卡牌或语言');
    const hash = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    if (hash !== record.audioSha256) throw new Error('核验文件哈希已变化');
    const artists = record.artists.map((name) => ({
      id:
        'artist:' +
        createHash('sha256').update(name).digest('hex').slice(0, 24),
      name,
    }));
    const question = QuestionSchema.parse({
      questionId: 'intro:' + record.id + ':' + hash.slice(0, 16),
      songId: song.id,
      recordingId: recording.recordingId,
      startMs: 0,
      durationMs: DUEL_RULES.roundMs,
      segmentKind: 'intro',
      answerCardId: card.cardId,
    });
    const root = resolve(input.cacheDirectory);
    const temporary = resolve(
      root,
      hash + '-intro-v1.' + randomUUID() + '.tmp.mp3',
    );
    if (!temporary.startsWith(root + sep))
      throw new Error('Invalid cache path');
    let target: string;
    try {
      // Strip ID3 titles/artists and cut the evaluated question only; original files stay untouched.
      await new Promise<void>((done, reject) =>
        execFile(
          input.ffmpeg,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-i',
            file,
            '-t',
            String(question.durationMs / 1000),
            '-map',
            '0:a:0',
            '-map_metadata',
            '-1',
            '-vn',
            '-ac',
            '2',
            '-ar',
            '44100',
            '-codec:a',
            'libmp3lame',
            '-b:a',
            '128k',
            '-id3v2_version',
            '0',
            '-write_id3v1',
            '0',
            '-write_xing',
            '0',
            temporary,
          ],
          { windowsHide: true, timeout: 30000 },
          (error) =>
            error
              ? reject(new Error('生成对局音频失败，请检查 ffmpeg 配置'))
              : done(),
        ),
      );
      const output = await readFile(temporary);
      if (output.length === 0) throw new Error('生成的对局音频为空');
      const outputHash = createHash('sha256').update(output).digest('hex');
      target = resolve(root, hash + '-intro-v1-' + outputHash + '.mp3');
      // Publish complete, immutable bytes without replacing files held by other rooms.
      // A hard link also keeps concurrent publishers from overwriting one another.
      try {
        await link(temporary, target);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          error.code !== 'EEXIST'
        )
          throw error;
        if (!(await readFile(target)).equals(output))
          throw new Error('已有对局音频缓存内容不匹配', { cause: error });
      }
    } finally {
      await rm(temporary, { force: true });
    }
    catalog = CatalogSchema.parse({
      ...catalog,
      catalogVersion:
        'reviewed:' +
        createHash('sha256')
          .update(JSON.stringify(records))
          .digest('hex')
          .slice(0, 24),
      songs: catalog.songs.map((s) =>
        s.id === song.id
          ? {
              ...s,
              title: record.title,
              artistIds: artists.map((a) => a.id),
              languages: [record.languageTag],
            }
          : s,
      ),
      artists: [
        ...catalog.artists,
        ...artists.filter(
          (a) => !catalog.artists.some((old) => old.id === a.id),
        ),
      ],
      recordings: catalog.recordings.map((r) =>
        r.recordingId === recording.recordingId
          ? { ...r, versionLabel: record.recordingVersion }
          : r,
      ),
      audioAssets: catalog.audioAssets.map((a) =>
        a.assetId === asset.assetId
          ? {
              ...a,
              usage: {
                status: 'verified',
                source: record.sourceReference,
                reference: record.reviewedBy + ' / ' + record.reviewedAt,
                allowedUse:
                  '用户授权的项目演示；录音与前奏核验清单绑定音频哈希',
              },
            }
          : a,
      ),
      cards: catalog.cards.map((c) =>
        c.cardId === card.cardId ? { ...c, text: record.title } : c,
      ),
      questions: [...catalog.questions, question],
    });
    verifiedQuestionIds.push(question.questionId);
    questionAudioFiles.set(question.questionId, target);
  }
  return { catalog, verifiedQuestionIds, questionAudioFiles };
}
