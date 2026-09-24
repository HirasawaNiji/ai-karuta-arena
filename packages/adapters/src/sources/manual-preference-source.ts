import {
  ManualPreferencesSchema,
  ONBOARDING_DEFAULTS,
  RawUserMusicDataSchema,
  ProfileBuildInputSchema,
  emptyPreferences,
  type ManualPreferences,
  type Catalog,
  type PlayerId,
  type MusicProfileSource,
  type RawUserMusicData,
  type ScoringConfig,
  type MusicPreferences,
} from '@amp/core';

/** Server supplies identity/time/IDs. Each submission is a complete current self-report. */
export class ManualPreferenceSource implements MusicProfileSource {
  readonly sourceId = 'manual:onboarding-v1';
  private readonly snapshots = new Map<PlayerId, RawUserMusicData>();
  submit(
    userId: PlayerId,
    input: ManualPreferences,
    catalog: Catalog,
    scoringConfig: ScoringConfig,
    observedAt: string,
    snapshotId: string,
  ): RawUserMusicData {
    const value = ManualPreferencesSchema.parse(input);
    const preferences: Record<
      keyof MusicPreferences,
      Record<string, { weight: number; confidence: number }>
    > = emptyPreferences();
    for (const id of value.tagIds) {
      const tag = catalog.taxonomy.find((t) => t.id === id);
      if (!tag) throw new Error('Unknown preference tag');
      preferences[tag.dimension][id] = {
        weight: ONBOARDING_DEFAULTS.weight,
        confidence: ONBOARDING_DEFAULTS.confidence,
      };
    }
    const scopeKeys = value.reports.map((r) =>
      JSON.stringify([
        r.songId,
        r.recognitionScope?.questionId,
        r.recognitionScope?.recordingId,
        r.recognitionScope?.segment,
      ]),
    );
    if (new Set(scopeKeys).size !== scopeKeys.length)
      throw new Error('Duplicate self-report scope');
    const raw = RawUserMusicDataSchema.parse({
      schemaVersion: 1,
      sourceId: this.sourceId,
      userId,
      snapshotId,
      observedAt,
      declaredPreferences: preferences,
      evidence: value.reports.map((r, i) => ({
        ...r,
        type: 'recognition_report',
        playerId: userId,
        sourceId: this.sourceId,
        observedAt,
        evidenceId: snapshotId + ':' + i,
      })),
    });
    ProfileBuildInputSchema.parse({
      catalog,
      rawData: [raw],
      scoringConfig,
      referenceTime: observedAt,
    });
    this.snapshots.set(userId, raw);
    return raw;
  }
  getUserMusicData(userId: PlayerId): Promise<RawUserMusicData> {
    const data = this.snapshots.get(userId);
    if (!data) return Promise.reject(new Error('Manual profile not submitted'));
    return Promise.resolve(data);
  }
}
