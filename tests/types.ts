import type { Catalog, PlayerId, SongId } from '@amp/core';

export function compileTimeBoundary(
  catalog: Catalog,
  song: SongId,
  player: PlayerId,
) {
  // @ts-expect-error Player IDs must not be usable as Song IDs.
  const invalidSong: SongId = player;
  // @ts-expect-error Catalog outputs are readonly.
  catalog.songs = [];
  if (catalog.songs[0]) {
    // @ts-expect-error Nested lists are readonly too.
    catalog.songs[0].languages = [];
  }
  return { invalidSong, song };
}

export function profileTypeBoundary(
  profile: import('@amp/core').PlayerMusicProfile,
  matrix: import('@amp/core').FamiliarityMatrix,
) {
  // @ts-expect-error Profile evidence collections are readonly.
  profile.songEvidence = {};
  // @ts-expect-error A matrix cannot be patched through its public snapshot.
  matrix.cells = {};
  // @ts-expect-error Versioned configuration snapshots are readonly.
  matrix.scoringConfig.weights.favorite = 0;
  return { profile, matrix };
}

export async function runtimePortTypeBoundary(
  runtime: import('@amp/core').PartyRuntime,
  game: import('@amp/core').MusicGame,
  source: import('@amp/core').MusicProfileSource,
  host: import('@amp/core').PartyHostAgent,
  factory: import('@amp/core').GameFactory,
  command: import('@amp/core').PartyCommand,
  actor: import('@amp/core').PartyActor,
  session: import('@amp/core').GameSessionInput,
) {
  const snapshot = runtime.getSnapshot();
  // @ts-expect-error Snapshots cannot be used to bypass runtime mutation.
  snapshot.phase = 'playing';
  // @ts-expect-error Actors cannot impersonate AI as a host.
  const ai: import('@amp/core').PartyActor = { role: 'ai' };
  // @ts-expect-error A not-finished union cannot be treated as a game result.
  const fabricated: import('@amp/core').GameResult = game.getResult();
  const acknowledgement: import('@amp/core').HostDecision = {
    // @ts-expect-error Host suggestions do not include user acknowledgement.
    action: 'ACKNOWLEDGE_CONTINUE',
    reason: 'x',
    message: 'x',
    reasonCodes: [],
  };
  // @ts-expect-error Frozen game input cannot be amended by an adapter.
  session.songIds = [];
  const loaded = await source.getUserMusicData(snapshot.hostPlayerId);
  const decision = await host.decide({
    snapshot,
    assessment: snapshot.fairnessAssessment,
    gameResult: snapshot.gameHistory.at(-1) ?? null,
  });
  const adapter = await factory.create(session, (event) => {
    void event.eventId;
  });
  await adapter.start();
  await adapter.stop();
  const dispatched = await runtime.dispatch(command, actor);
  const drained = await runtime.drainEvents();
  return {
    ai,
    fabricated,
    acknowledgement,
    loaded,
    decision,
    dispatched,
    drained,
  };
}
