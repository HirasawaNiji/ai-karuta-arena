import { Buffer } from 'node:buffer';
import { CatalogSchema } from '@amp/core';
import { createHash } from 'node:crypto';

// Generated engineering fixture. These are distinguishable PCM tones, not songs or recognition evidence.
export function testMaterials(count = 84) {
  const files = new Map();
  const hashTitles = new Map();
  const songs = Array.from({ length: count }, (_, i) => ({
    id: 'test-song:' + i,
    title: '合成测试音 ' + String(i + 1).padStart(3, '0'),
    artistIds: ['test-artist'],
    genres: [],
    languages: ['lang:instrumental'],
    source: 'generated-browser-fixture',
  }));
  for (const [i, song] of songs.entries()) {
    const rate = 8000,
      samples = rate * 10;
    const wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(samples * 2, 40);
    for (let sample = 0; sample < samples; sample++)
      wav.writeInt16LE(
        Math.round(
          Math.sin((2 * Math.PI * (200 + i * 7) * sample) / rate) * 1500,
        ),
        44 + sample * 2,
      );
    files.set('test-question:' + i, wav);
    hashTitles.set(createHash('sha256').update(wav).digest('hex'), song.title);
  }
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    catalogVersion: 'synthetic-browser-v1',
    taxonomyVersion: 'browser-v1',
    taxonomy: [
      { id: 'lang:instrumental', dimension: 'languages', label: '测试音' },
    ],
    artists: [{ id: 'test-artist', name: '自动化合成夹具' }],
    songs,
    players: [],
    audioAssets: songs.map((s, i) => ({
      assetId: 'test-asset:' + i,
      resourcePath: 'generated/' + i + '.wav',
      durationMs: 10000,
      available: true,
      usage: {
        status: 'verified',
        source: 'Generated PCM tone for automated engineering regression only',
        reference: 'tests/browser/materials.mjs',
        allowedUse: 'Repository automated tests only',
      },
    })),
    recordings: songs.map((s, i) => ({
      recordingId: 'test-recording:' + i,
      songId: s.id,
      versionLabel: 'Generated test tone',
      audioAssetId: 'test-asset:' + i,
    })),
    cards: songs.map((s, i) => ({
      cardId: 'test-card:' + i,
      answerKind: 'song-title',
      text: s.title,
    })),
    questions: songs.map((s, i) => ({
      questionId: 'test-question:' + i,
      songId: s.id,
      recordingId: 'test-recording:' + i,
      startMs: 0,
      durationMs: 10000,
      segmentKind: 'intro',
      answerCardId: 'test-card:' + i,
    })),
  });
  return { catalog, files, hashTitles };
}
