import {
  ProfileBuildInputSchema,
  PlayerMusicProfileSchema,
  eraForYear,
  type Evidence,
  type EvidenceId,
  type PlayerId,
  type PlayerMusicProfile,
  type ProfileBuildInput,
  type RawUserMusicData,
} from '@amp/core';
import { normalizeEvidence } from './normalize-evidence.js';
import { canonical, compare, playScore } from './util.js';

type Dimension = keyof PlayerMusicProfile['preferences'];
type Candidate = {
  weight: number;
  confidence: number;
  source: 'declared' | 'inferred';
  evidenceIds: EvidenceId[];
};
const dimensions: readonly Dimension[] = [
  'genres',
  'artists',
  'languages',
  'regions',
  'eras',
  'cultures',
  'franchises',
  'scenes',
];
/** Caller stores full raw history and supplies the last accepted profile for versioning. */
export function buildPlayerProfile(
  input: ProfileBuildInput,
  playerId: PlayerId,
  previous?: PlayerMusicProfile,
): PlayerMusicProfile {
  const {
    catalog,
    rawData,
    referenceTime,
    scoringConfig: config,
  } = ProfileBuildInputSchema.parse(input);
  const player = catalog.players.find((entry) => entry.player.id === playerId);
  if (!player) throw new Error('Unknown profile player');
  if (
    previous &&
    (previous.playerId !== playerId ||
      Date.parse(previous.updatedAt) > Date.parse(referenceTime))
  )
    throw new Error('Previous profile belongs to another player or future');
  const records = rawData.filter((raw) => raw.userId === playerId);
  const snapshotIds = new Map<string, string>();
  const sources = new Map<string, RawUserMusicData>();
  for (const raw of [...records].sort(
    (a, b) =>
      Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
      compare(a.snapshotId, b.snapshotId),
  )) {
    const key = canonical([raw.sourceId, raw.snapshotId]);
    const content = canonical({
      ...raw,
      evidence: [...raw.evidence].map(canonical).sort(compare),
    });
    if (snapshotIds.has(key) && snapshotIds.get(key) !== content)
      throw new Error('Conflicting snapshot ID');
    snapshotIds.set(key, content);
    sources.set(raw.sourceId, raw);
  }
  const evidence = normalizeEvidence(
    records.flatMap((raw) => raw.evidence),
    catalog,
    referenceTime,
  ).evidence;
  const candidates = new Map<Dimension, Map<string, Candidate>>();
  for (const dimension of dimensions) candidates.set(dimension, new Map());
  function offer(dimension: Dimension, id: string, candidate: Candidate) {
    const values = candidates.get(dimension)!;
    const old = values.get(id);
    if (
      !old ||
      candidate.weight > old.weight ||
      (candidate.weight === old.weight &&
        (candidate.confidence > old.confidence ||
          (candidate.confidence === old.confidence &&
            candidate.source === 'declared' &&
            old.source !== 'declared')))
    )
      values.set(id, candidate);
  }
  const declarations = [
    player,
    ...[...sources.values()]
      .sort((a, b) => compare(a.sourceId, b.sourceId))
      .map((raw) => ({ preferences: raw.declaredPreferences })),
  ];
  for (const declaration of declarations)
    for (const dimension of dimensions)
      for (const [id, value] of Object.entries(
        declaration.preferences[dimension],
      ))
        offer(dimension, id, { ...value, source: 'declared', evidenceIds: [] });
  const inferred = new Map<
    string,
    {
      dimension: Dimension;
      id: string;
      strength: number;
      songs: Set<string>;
      ids: Set<EvidenceId>;
    }
  >();
  for (const song of [...catalog.songs].sort((a, b) => compare(a.id, b.id))) {
    const interests = evidence
      .filter((e) => 'songId' in e && e.songId === song.id)
      .map((e) => ({
        e,
        value:
          e.type === 'favorite' && e.active
            ? config.profile.favoriteStrength
            : e.type === 'playlist' && e.active
              ? config.profile.playlistStrength
              : e.type === 'top_song' && e.active
                ? config.profile.topSongStrength
                : e.type === 'play_count'
                  ? playScore(e.count, config.playCountCap)
                  : 0,
      }));
    const strength = Math.max(0, ...interests.map((i) => i.value));
    if (strength === 0) continue;
    const ids = interests
      .filter((i) => i.value === strength)
      .map((i) => i.e.evidenceId);
    const eraId =
      song.releaseYear === undefined
        ? undefined
        : 'era:' + eraForYear(song.releaseYear);
    for (const dimension of dimensions) {
      const tags =
        dimension === 'artists'
          ? song.artistIds
          : dimension === 'eras'
            ? eraId === undefined
              ? []
              : catalog.taxonomy
                  .filter((t) => t.dimension === 'eras' && t.id === eraId)
                  .map((t) => t.id)
            : (song[dimension] ?? []);
      for (const id of [...tags].sort(compare)) {
        const key = canonical([dimension, id]);
        const current = inferred.get(key) ?? {
          dimension,
          id,
          strength: 0,
          songs: new Set<string>(),
          ids: new Set<EvidenceId>(),
        };
        current.strength += strength / tags.length;
        current.songs.add(song.id);
        ids.forEach((id) => current.ids.add(id));
        inferred.set(key, current);
      }
    }
  }
  for (const item of inferred.values())
    offer(item.dimension, item.id, {
      weight: Math.min(1, item.strength / config.profile.inferredWeightDivisor),
      confidence: Math.min(
        config.profile.inferredConfidenceCap,
        item.songs.size / config.profile.confidenceSongDivisor,
      ),
      source: 'inferred',
      evidenceIds: [...item.ids].sort(compare),
    });
  for (const item of evidence)
    if (item.type === 'top_artist' && item.active)
      offer('artists', item.artistId, {
        weight: config.profile.topArtistWeight,
        confidence: config.profile.topArtistConfidence,
        source: 'inferred',
        evidenceIds: [item.evidenceId],
      });
  const preferences: Record<
    string,
    Record<string, { weight: number; confidence: number }>
  > = Object.create(null) as Record<
    string,
    Record<string, { weight: number; confidence: number }>
  >;
  const provenance: {
    dimension: Dimension;
    id: string;
    source: 'declared' | 'inferred';
    evidenceIds: EvidenceId[];
  }[] = [];
  const confidenceValues: number[] = [];
  for (const dimension of dimensions) {
    preferences[dimension] = Object.fromEntries(
      [...candidates.get(dimension)!]
        .sort(([a], [b]) => compare(a, b))
        .map(([id, candidate]) => {
          provenance.push({
            dimension,
            id,
            source: candidate.source,
            evidenceIds: candidate.evidenceIds,
          });
          confidenceValues.push(candidate.confidence);
          return [
            id,
            { weight: candidate.weight, confidence: candidate.confidence },
          ];
        }),
    );
  }
  const songEvidence: Record<string, Evidence[]> = Object.create(
    null,
  ) as Record<string, Evidence[]>;
  const artistEvidence: Record<string, Evidence[]> = Object.create(
    null,
  ) as Record<string, Evidence[]>;
  for (const item of evidence) {
    const map = 'songId' in item ? songEvidence : artistEvidence;
    const id = 'songId' in item ? item.songId : item.artistId;
    (map[id] ??= []).push(item);
  }
  // Optional summary values use latest explicit source value, falling back to the player declaration.
  const newest = [...sources.values()].sort(
    (a, b) =>
      Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
      compare(a.sourceId, b.sourceId),
  );
  const extras: { explorationScore?: number; mainstreamScore?: number } = {};
  for (const field of ['explorationScore', 'mainstreamScore'] as const) {
    const value =
      [...newest].reverse().find((raw) => raw[field] !== undefined)?.[field] ??
      player[field];
    if (value !== undefined) extras[field] = value;
  }
  const body = {
    playerId,
    preferences,
    songEvidence,
    artistEvidence,
    provenance,
    ...extras,
    confidence: confidenceValues.length
      ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
      : 0,
  };
  // Canonical effective content includes the derivation parameters, never the import timestamp.
  const inputFingerprint = canonical({
    body,
    profileConfig: config.profile,
    playCountCap: config.playCountCap,
  });
  if (previous?.inputFingerprint === inputFingerprint)
    return PlayerMusicProfileSchema.parse(previous);
  return PlayerMusicProfileSchema.parse({
    ...body,
    inputFingerprint,
    profileVersion: (previous?.profileVersion ?? 0) + 1,
    updatedAt: referenceTime,
  });
}
