import process from 'node:process';
import console from 'node:console';
import { fileURLToPath } from 'node:url';
import { loadPendingMaterials } from './materials.js';
import { resolve } from 'node:path';
import { loadReviewedMaterials } from './reviewed-materials.js';
import { createApp } from './server.js';

const loadMaterial = () =>
  loadPendingMaterials(
    fileURLToPath(
      new URL('../../../docs/evidence/d0-pjsk-materials.json', import.meta.url),
    ),
    process.env.AMP_MATERIAL_DIR,
  );
const material = await loadMaterial();
const reviewPath =
  process.env.AMP_REVIEWED_MATERIALS ??
  (process.env.AMP_MATERIAL_DIR
    ? fileURLToPath(
        new URL(
          '../../../docs/evidence/pjsk-intro-review.json',
          import.meta.url,
        ),
      )
    : undefined);
const reviewed = reviewPath
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
  ...reviewed,
  ...(reviewPath
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
const host = process.env.HOST ?? '127.0.0.1';
app.server.listen(port, host, () =>
  console.log('Music Party: http://' + host + ':' + port),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
