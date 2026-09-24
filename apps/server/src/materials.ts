import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { CatalogSchema, type Catalog } from '@amp/core';

export interface MaterialRecord {
  sourceTrackId: string;
  title: string;
  artist: string | null;
  audio: {
    member: string;
    sha256: string;
    durationMs: number;
    bytes: number;
    decodeOk: boolean;
  };
  semanticReview: 'pending';
}
export interface MaterialPreview {
  id: string;
  title: string;
  artist: string;
  durationMs: number;
  available: boolean;
  sha256: string;
  status: 'pending';
}
export async function loadPendingMaterials(
  auditPath: string,
  directory?: string,
): Promise<{
  catalog: Catalog;
  files: Map<string, string>;
  previews: MaterialPreview[];
}> {
  const raw: unknown = JSON.parse(await readFile(auditPath, 'utf8'));
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('records' in raw) ||
    !Array.isArray(raw.records)
  )
    throw new Error('Invalid material audit');
  // The checked-in audit is a trusted build input, never a browser upload.
  const records = raw.records as MaterialRecord[];
  const files = new Map<string, string>();
  const previews: MaterialPreview[] = [];
  for (const r of records) {
    if (
      !/^[A-Za-z0-9-]+$/.test(r.sourceTrackId) ||
      !r.audio?.sha256 ||
      r.semanticReview !== 'pending'
    )
      throw new Error('Invalid pending material');
    if (directory) {
      const root = resolve(directory);
      const file = resolve(root, r.audio.member);
      if (!file.startsWith(root + sep))
        throw new Error('Material path escapes root');
      try {
        const info = await stat(file);
        if (
          info.size === r.audio.bytes &&
          createHash('sha256')
            .update(await readFile(file))
            .digest('hex') === r.audio.sha256
        )
          files.set(r.sourceTrackId, file);
      } catch {
        /* Missing material remains unavailable. */
      }
    }
    previews.push({
      id: r.sourceTrackId,
      title: r.title,
      artist: r.artist ?? '艺人待核验',
      durationMs: r.audio.durationMs,
      available: files.has(r.sourceTrackId),
      sha256: r.audio.sha256,
      status: 'pending',
    });
  }
  const catalog: Catalog = CatalogSchema.parse({
    schemaVersion: 1,
    catalogVersion: 'pjsk-pending-d0-v1',
    taxonomyVersion: 'onboarding-tags-v1',
    taxonomy: [
      { id: 'lang:unknown', dimension: 'languages', label: '语言待核验' },
      { id: 'genre:pop', dimension: 'genres', label: '流行' },
      { id: 'genre:rock', dimension: 'genres', label: '摇滚' },
      { id: 'genre:electronic', dimension: 'genres', label: '电子' },
      { id: 'lang:zh', dimension: 'languages', label: '华语' },
      { id: 'lang:ja', dimension: 'languages', label: '日语' },
      { id: 'lang:en', dimension: 'languages', label: '英语' },
    ],
    artists: [{ id: 'artist:unknown', name: '艺人待核验' }],
    players: [],
    songs: records.map((r) => ({
      id: r.sourceTrackId,
      title: r.title,
      artistIds: ['artist:unknown'],
      genres: [],
      languages: ['lang:unknown'],
      source: 'd0-pjsk-pending',
    })),
    audioAssets: records.map((r) => ({
      assetId: 'asset:' + r.sourceTrackId,
      resourcePath: r.audio.member,
      durationMs: r.audio.durationMs,
      available: files.has(r.sourceTrackId),
      usage: {
        status: 'pending',
        source: '现有管理素材，可供本地核验；录音版本与片段语义待确认',
      },
    })),
    recordings: records.map((r) => ({
      recordingId: 'recording:' + r.sourceTrackId,
      songId: r.sourceTrackId,
      versionLabel: '录音版本待核验',
      audioAssetId: 'asset:' + r.sourceTrackId,
    })),
    questions: [],
    cards: records.map((r) => ({
      cardId: 'card:' + r.sourceTrackId,
      answerKind: 'song-title',
      text: r.title,
    })),
  });
  return { catalog, files, previews };
}
