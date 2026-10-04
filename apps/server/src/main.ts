import process from 'node:process';
import console from 'node:console';
import { fileURLToPath } from 'node:url';
import { loadPendingMaterials } from './materials.js';
import { resolve } from 'node:path';
import { loadReviewedMaterials } from './reviewed-materials.js';
import { createApp } from './server.js';
import { loadDownloadedMaterials } from './downloaded-materials.js';

const practice = process.env.AMP_PRACTICE === '1';
const host = process.env.HOST ?? '127.0.0.1';
if (practice && host !== '127.0.0.1' && host !== '::1')
  throw new Error('人机陪练仅允许本机回环地址');

const loadMaterial = () =>
  loadPendingMaterials(
    fileURLToPath(
      new URL('../../../docs/evidence/d0-pjsk-materials.json', import.meta.url),
    ),
    process.env.AMP_MATERIAL_DIR,
  );
const downloadManifest = process.env.AMP_DOWNLOADED_MATERIALS;
const loadDownloads = () => {
  if (!downloadManifest || !process.env.AMP_MATERIAL_DIR)
    throw new Error('Downloaded manifest requires AMP_MATERIAL_DIR');
  return loadDownloadedMaterials({
    manifestPath: downloadManifest,
    directory: process.env.AMP_MATERIAL_DIR,
    cacheDirectory: resolve(process.env.AMP_AUDIO_CACHE ?? '.local/duel-audio'),
    ffmpeg: process.env.FFMPEG_PATH ?? 'ffmpeg',
  });
};
const material = downloadManifest
  ? await loadDownloads()
  : await loadMaterial();
const reviewPath = downloadManifest
  ? undefined
  : (process.env.AMP_REVIEWED_MATERIALS ??
    (process.env.AMP_MATERIAL_DIR
      ? fileURLToPath(
          new URL(
            '../../../docs/evidence/pjsk-intro-review.json',
            import.meta.url,
          ),
        )
      : undefined));
const reviewed = downloadManifest
  ? (material as Awaited<ReturnType<typeof loadDownloadedMaterials>>)
  : reviewPath
    ? await loadReviewedMaterials({
        catalog: material.catalog,
        files: material.files,
        manifestPath: reviewPath,
        cacheDirectory: resolve(
          process.env.AMP_AUDIO_CACHE ?? '.local/duel-audio',
        ),
        ffmpeg: process.env.FFMPEG_PATH ?? 'ffmpeg',
      })
    : {
        catalog: material.catalog,
        verifiedQuestionIds: [],
        questionAudioFiles: new Map<string, string>(),
      };
const app = createApp({
  practice,
  ...reviewed,
  ...(downloadManifest
    ? { reloadTournamentMaterials: loadDownloads }
    : reviewPath
      ? {
          reloadTournamentMaterials: async () => {
            const fresh = await loadMaterial();
            return loadReviewedMaterials({
              catalog: fresh.catalog,
              files: fresh.files,
              manifestPath: reviewPath,
              cacheDirectory: resolve(
                process.env.AMP_AUDIO_CACHE ?? '.local/duel-audio',
              ),
              ffmpeg: process.env.FFMPEG_PATH ?? 'ffmpeg',
            });
          },
        }
      : {}),
  materials: material.previews.map((m) => ({
    ...m,
    artist:
      reviewed.catalog.songs
        .find((s) => s.id === m.id)
        ?.artistIds.map(
          (id) => reviewed.catalog.artists.find((a) => a.id === id)?.name ?? id,
        )
        .join(' / ') ?? m.artist,
    status: reviewed.catalog.questions.some((q) => q.songId === m.id)
      ? ('verified' as const)
      : ('pending' as const),
  })),
  mediaFiles: material.files,
  webDirectory: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
app.server.listen(port, host, () =>
  console.log('Music Party: http://' + host + ':' + port),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
