import { readFile, mkdir, link, rm, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CatalogSchema, DUEL_RULES, type Catalog } from '@amp/core';
import { type MaterialPreview } from './materials.js';

const execute = promisify(execFile);
/** Trusted administrator input. Exact platform IDs are verified by the downloader;
 * this is machine provenance, not a claim of human listening acceptance. */
export async function loadDownloadedMaterials(input: {
  manifestPath: string;
  directory: string;
  cacheDirectory: string;
  ffmpeg: string;
}): Promise<{
  catalog: Catalog;
  files: Map<string, string>;
  previews: MaterialPreview[];
  verifiedQuestionIds: string[];
  questionAudioFiles: Map<string, string>;
}> {
  const raw = JSON.parse(await readFile(input.manifestPath, 'utf8')) as {
    schemaVersion: string;
    taxonomy: Catalog['taxonomy'];
    records: {
      id: string;
      title: string;
      artists: string[];
      tagIds: string[];
      sourceSongId: string;
      sourceAlbumId?: string;
      sourcePlatform?: string;
      sourceChannelId?: string;
      sourceAlbum?: string;
      sourceReview?: string;
      sourceTrust?: string;
      sourceStartMs?: number;
      sourceDurationMs?: number;
      sourceReference: string;
      file: string;
      audioSha256: string;
      bytes: number;
      audioDurationMs: number;
      introDurationMs: number;
      recordingDurationMs: number;
      retrievedAt: string;
      verification: string;
    }[];
  };
  if (
    !['netease-intros-v1', 'downloaded-intros-v2'].includes(
      raw.schemaVersion,
    ) ||
    !Array.isArray(raw.records)
  )
    throw new Error('Invalid downloaded intro manifest');
  const root = resolve(input.directory);
  const cache = resolve(input.cacheDirectory);
  await mkdir(cache, { recursive: true });
  const cachedNames = await readdir(cache);
  const files = new Map<string, string>();
  const questionAudioFiles = new Map<string, string>();
  const artistMap = new Map<string, string>();
  const sourceIds = new Set<string>();
  const byDimension = (ids: string[], dimension: string) =>
    ids.filter((id) =>
      raw.taxonomy.some((t) => t.id === id && t.dimension === dimension),
    );
  const songs = [];
  const recordings = [];
  const audioAssets = [];
  const questions = [];
  const cards = [];
  const previews: MaterialPreview[] = [];
  for (const r of raw.records) {
    const file = resolve(root, r.file);
    const platform =
      raw.schemaVersion === 'netease-intros-v1' ? 'netease' : r.sourcePlatform;
    const sourceKey = platform + ':' + r.sourceSongId;
    const netease =
      platform === 'netease' &&
      /^\d+$/.test(r.sourceSongId) &&
      /^\d+$/.test(r.sourceAlbumId ?? '') &&
      r.sourceReference ===
        'https://music.163.com/#/song?id=' + r.sourceSongId &&
      r.verification === 'exact-platform-id-full-source-zero-start-decode' &&
      (r.sourceStartMs === undefined || r.sourceStartMs === 0) &&
      (r.sourcePlatform === undefined || r.sourcePlatform === 'netease');
    const youtube =
      raw.schemaVersion === 'downloaded-intros-v2' &&
      platform === 'youtube' &&
      /^[A-Za-z0-9_-]{11}$/.test(r.sourceSongId) &&
      /^UC[A-Za-z0-9_-]{22}$/.test(r.sourceChannelId ?? '') &&
      r.sourceReference ===
        'https://www.youtube.com/watch?v=' + r.sourceSongId &&
      !!r.sourceAlbum?.trim() &&
      !!r.sourceReview?.trim() &&
      ['label-or-artist', 'community-upload'].includes(r.sourceTrust ?? '') &&
      r.sourceStartMs === 0 &&
      Number.isSafeInteger(r.sourceDurationMs) &&
      r.sourceDurationMs! >= 30000 &&
      r.verification === 'reviewed-platform-metadata-original-intro-decode';
    const fiveSing =
      raw.schemaVersion === 'downloaded-intros-v2' &&
      platform === '5sing' &&
      /^\d+$/.test(r.sourceSongId) &&
      /^\d+$/.test(r.sourceChannelId ?? '') &&
      r.sourceReference ===
        'https://5sing.kugou.com/yc/' + r.sourceSongId + '.html' &&
      !!r.sourceAlbum?.trim() &&
      !!r.sourceReview?.trim() &&
      r.sourceTrust === 'author-original' &&
      r.sourceStartMs === 0 &&
      Number.isSafeInteger(r.sourceDurationMs) &&
      r.sourceDurationMs! >= 30000 &&
      r.verification === 'reviewed-platform-metadata-original-intro-decode';
    if (
      !/^S\d{3,}$/.test(r.id) ||
      files.has(r.id) ||
      !(netease || youtube || fiveSing) ||
      sourceIds.has(sourceKey) ||
      !/^[a-f0-9]{64}$/.test(r.audioSha256) ||
      !file.startsWith(root + sep) ||
      r.file !== r.id + '.mp3' ||
      !r.title?.trim() ||
      !Array.isArray(r.artists) ||
      !r.artists.length ||
      r.artists.some((a) => !a.trim()) ||
      r.introDurationMs !== 30000 ||
      !Number.isSafeInteger(r.audioDurationMs) ||
      r.audioDurationMs < 30000 ||
      r.audioDurationMs > 30150 ||
      !Number.isSafeInteger(r.recordingDurationMs) ||
      r.recordingDurationMs < r.introDurationMs ||
      !Number.isFinite(Date.parse(r.retrievedAt)) ||
      !Array.isArray(r.tagIds) ||
      r.tagIds.some((id) => !raw.taxonomy.some((t) => t.id === id))
    )
      throw new Error('Downloaded intro provenance is incomplete');
    const bytes = await readFile(file);
    if (
      bytes.length !== r.bytes ||
      createHash('sha256').update(bytes).digest('hex') !== r.audioSha256
    )
      throw new Error('Downloaded intro bytes changed');
    sourceIds.add(sourceKey);
    files.set(r.id, file);
    const artistIds = r.artists.map((name) => {
      const id =
        'artist:' +
        createHash('sha256').update(name).digest('hex').slice(0, 24);
      artistMap.set(id, name);
      return id;
    });
    const questionId = 'intro:' + r.id + ':' + r.audioSha256.slice(0, 16);
    const prefix = r.audioSha256 + '-intro-' + DUEL_RULES.roundMs + '-';
    const cachedName = cachedNames.find(
      (name) =>
        name.startsWith(prefix) &&
        /^[a-f0-9]{64}\.mp3$/.test(name.slice(prefix.length)),
    );
    if (cachedName) {
      const cachedPath = resolve(cache, cachedName);
      const output = await readFile(cachedPath);
      if (
        !output.length ||
        createHash('sha256').update(output).digest('hex') !==
          cachedName.slice(prefix.length, -4)
      )
        throw new Error('Question audio cache bytes changed');
      questionAudioFiles.set(questionId, cachedPath);
    } else {
      const temporary = resolve(cache, randomUUID() + '.tmp.mp3');
      try {
        await execute(
          input.ffmpeg,
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-i',
            file,
            '-t',
            String(DUEL_RULES.roundMs / 1000),
            '-map',
            '0:a:0',
            '-map_metadata',
            '-1',
            '-vn',
            '-ac',
            '2',
            '-ar',
            '44100',
            '-c:a',
            'libmp3lame',
            '-b:a',
            '96k',
            '-id3v2_version',
            '0',
            '-write_id3v1',
            '0',
            '-write_xing',
            '0',
            temporary,
          ],
          { windowsHide: true, timeout: 30000 },
        );
        const output = await readFile(temporary);
        if (!output.length) throw new Error('Empty question audio');
        const hash = createHash('sha256').update(output).digest('hex');
        const target = resolve(
          cache,
          r.audioSha256 + '-intro-' + DUEL_RULES.roundMs + '-' + hash + '.mp3',
        );
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
            throw new Error('Question audio cache mismatch', { cause: error });
        }
        questionAudioFiles.set(questionId, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    const languageTags = byDimension(r.tagIds, 'languages');
    songs.push({
      id: r.id,
      title: r.title,
      artistIds,
      languages: languageTags.length ? languageTags : ['lang:unknown'],
      genres: byDimension(r.tagIds, 'genres'),
      cultures: byDimension(r.tagIds, 'cultures'),
      source:
        platform === 'netease'
          ? 'netease-exact-recording'
          : platform + '-reviewed-recording',
    });
    recordings.push({
      recordingId: 'recording:' + r.id,
      songId: r.id,
      audioAssetId: 'asset:' + r.id,
      versionLabel: netease
        ? '网易云录音 ' + r.sourceSongId + ' / 专辑 ' + r.sourceAlbumId
        : platform +
          ' 音源 ' +
          r.sourceSongId +
          ' / ' +
          r.sourceAlbum +
          ' / ' +
          r.sourceReview,
    });
    audioAssets.push({
      assetId: 'asset:' + r.id,
      resourcePath: r.file,
      durationMs: r.introDurationMs,
      available: true,
      usage: {
        status: 'verified',
        source: r.sourceReference,
        reference:
          r.verification +
          ' / ' +
          r.retrievedAt +
          (youtube || fiveSing ? ' / 源起点 ' + r.sourceStartMs + 'ms' : ''),
        allowedUse:
          '用户授权的项目演示；来源与版本依据、从零截取及解码核验，尚未真人听辨验收',
      },
    });
    cards.push({
      cardId: 'card:' + r.id,
      answerKind: 'song-title',
      text: r.title,
    });
    questions.push({
      questionId,
      songId: r.id,
      recordingId: 'recording:' + r.id,
      startMs: 0,
      durationMs: DUEL_RULES.roundMs,
      segmentKind: 'intro',
      answerCardId: 'card:' + r.id,
    });
    previews.push({
      id: r.id,
      title: r.title,
      artist: r.artists.join(' / '),
      durationMs: r.introDurationMs,
      available: true,
      sha256: r.audioSha256,
      status: 'verified',
    });
  }
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    catalogVersion:
      'downloaded:' +
      createHash('sha256')
        .update(JSON.stringify(raw))
        .digest('hex')
        .slice(0, 24),
    taxonomyVersion: 'onboarding-tags-v2',
    taxonomy: [
      ...raw.taxonomy,
      { id: 'lang:unknown', dimension: 'languages', label: '语言待核验' },
    ],
    artists: [...artistMap].map(([id, name]) => ({ id, name })),
    players: [],
    songs,
    recordings,
    audioAssets,
    questions,
    cards,
  });
  return {
    catalog,
    files,
    previews,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
    questionAudioFiles,
  };
}
