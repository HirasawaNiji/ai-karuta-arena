import {
  RawUserMusicDataSchema,
  StableIdSchema,
  type MusicProfileSource,
  type PlayerId,
  type RawUserMusicData,
} from '@amp/core';

/** An in-memory source; every call returns a freshly parsed copy. */
export class MockMusicSource implements MusicProfileSource {
  readonly sourceId: string;
  private readonly snapshots: ReadonlyMap<PlayerId, RawUserMusicData>;
  constructor(sourceId: string, snapshots: readonly RawUserMusicData[]) {
    this.sourceId = StableIdSchema.parse(sourceId);
    const entries = snapshots.map((value) =>
      RawUserMusicDataSchema.parse(value),
    );
    if (
      entries.some((entry) => entry.sourceId !== sourceId) ||
      new Set(entries.map((entry) => entry.userId)).size !== entries.length
    )
      throw new Error('Mock source needs one matching snapshot per player');
    this.snapshots = new Map(entries.map((entry) => [entry.userId, entry]));
  }
  getUserMusicData(userId: PlayerId): Promise<RawUserMusicData> {
    const snapshot = this.snapshots.get(userId);
    if (!snapshot) return Promise.reject(new Error('Unknown Mock player'));
    return Promise.resolve(RawUserMusicDataSchema.parse(snapshot));
  }
}
