import {
  FamiliarityEstimateSchema,
  PlayerMusicProfileSchema,
  ScoringConfigSchema,
  SongProfileSchema,
  TaxonomySchema,
  UtcTimestampSchema,
  type Evidence,
  type EvidenceId,
  type FamiliarityEstimate,
  type PlayerMusicProfile,
  type ScoringConfig,
  type SongProfile,
  type Taxonomy,
  QuestionSchema,
  type Question,
} from '@amp/core';
import { clamp, compare, decay, latest, playScore } from './util.js';
import {
  matchesScope,
  scopeSpecificity,
  applicableRecognition,
} from './manual-scope.js';
type Feature = keyof ScoringConfig['weights'];
export function scoreFamiliarity(
  profile: PlayerMusicProfile,
  song: SongProfile,
  config: ScoringConfig,
  referenceTime: string,
  taxonomy: Taxonomy,
  question?: Question,
): FamiliarityEstimate {
  if (question) {
    QuestionSchema.parse(question);
    if (question.songId !== song.id)
      throw new Error('Question belongs to another song');
  }
  PlayerMusicProfileSchema.parse(profile);
  SongProfileSchema.parse(song);
  ScoringConfigSchema.parse(config);
  TaxonomySchema.parse(taxonomy);
  UtcTimestampSchema.parse(referenceTime);
  if (Date.parse(profile.updatedAt) > Date.parse(referenceTime))
    throw new Error('Profile is newer than score time');
  return scoreValidated(
    profile,
    song,
    config,
    referenceTime,
    taxonomy,
    question,
  );
}
/** Internal hot path: matrix builder has already validated the entire input context. */
export function scoreValidated(
  profile: PlayerMusicProfile,
  song: SongProfile,
  config: ScoringConfig,
  referenceTime: string,
  taxonomy: Taxonomy,
  question?: Question,
): FamiliarityEstimate {
  const evidence = (profile.songEvidence[song.id] ?? []).filter(
    (e) => !config.manual || applicableRecognition(e, question),
  );
  const features = new Map<Feature, { value: number; ids: EvidenceId[] }>();
  const bases: FamiliarityEstimate['confidenceBasis'][] = [
    { feature: 'none', evidenceIds: [], value: 0 },
  ];
  function feature(
    name: Feature,
    value: number,
    items: readonly Evidence[] = [],
  ) {
    features.set(name, {
      value,
      ids: items.map((e) => e.evidenceId).sort(compare),
    });
  }
  function basis(name: string, value: number, items: readonly Evidence[] = []) {
    bases.push({
      feature: name,
      value,
      evidenceIds: items.map((e) => e.evidenceId).sort(compare),
    });
  }
  feature('prior', 1);
  for (const [type, name] of [
    ['favorite', 'favorite'],
    ['playlist', 'playlist'],
    ['top_song', 'topSong'],
  ] as const) {
    const active = evidence.filter((e) => e.type === type && e.active);
    feature(name, active.length ? 1 : 0, active);
    if (active.length) basis(name, config.confidence[name], active);
  }
  const counts = evidence
    .filter((e) => e.type === 'play_count')
    .filter((e) => e.countKind === 'cumulative');
  const count = Math.max(0, ...counts.map((e) => e.count));
  const countItems = counts.filter((e) => e.count === count);
  const play = playScore(count, config.playCountCap);
  feature('playCount', play, countItems);
  if (countItems.length)
    basis(
      'playCount',
      config.confidence.playCount.base +
        config.confidence.playCount.gain * play,
      countItems,
    );
  const recent = evidence
    .filter((e) => e.type === 'recent_play')
    .sort(
      (a, b) =>
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
        compare(a.evidenceId, b.evidenceId),
    )
    .at(-1);
  const recency = recent
    ? decay(recent.occurredAt, referenceTime, config.recencyHalfLifeDays)
    : 0;
  feature('recency', recency, recent ? [recent] : []);
  if (recent)
    basis(
      'recency',
      config.confidence.recency.base + config.confidence.recency.gain * recency,
      [recent],
    );
  const report = latest(evidence.filter((e) => e.type === 'self_report'));
  feature('selfReport', report?.familiarity ?? 0, report ? [report] : []);
  if (report) basis('selfReport', config.confidence.selfReport, [report]);
  const genreIds = new Set(song.genres);
  const tags = new Map(taxonomy.map((t) => [t.id, t]));
  for (const id of song.genres) {
    let parent = tags.get(id)?.parentId;
    while (parent !== undefined) {
      genreIds.add(parent);
      parent = tags.get(parent)?.parentId;
    }
  }
  for (const [dimension, name, ids] of [
    ['artists', 'artistAffinity', song.artistIds],
    ['genres', 'genreAffinity', [...genreIds]],
    ['languages', 'languageAffinity', song.languages],
  ] as const) {
    const matches = Object.entries(profile.preferences[dimension])
      .filter(([id]) => (ids as readonly string[]).includes(id))
      .sort(([a], [b]) => compare(a, b));
    const max = Math.max(0, ...matches.map(([, value]) => value.weight));
    const winners = matches.filter(([, value]) => value.weight === max);
    const evidenceIds = [
      ...new Set(
        winners.flatMap(
          ([id]) =>
            profile.provenance.find(
              (p) => p.dimension === dimension && p.id === id,
            )?.evidenceIds ?? [],
        ),
      ),
    ].sort(compare);
    features.set(name, { value: max, ids: evidenceIds });
    // Confidence support can come from any actual matching preference, including a zero weight.
    for (const [id, value] of matches)
      bases.push({
        feature: name,
        value: config.confidence.affinityMultiplier * value.confidence,
        evidenceIds:
          profile.provenance.find(
            (p) => p.dimension === dimension && p.id === id,
          )?.evidenceIds ?? [],
      });
  }
  const order: readonly Feature[] = [
    'prior',
    'favorite',
    'playlist',
    'playCount',
    'recency',
    'topSong',
    'selfReport',
    'artistAffinity',
    'genreAffinity',
    'languageAffinity',
  ];
  const reasons = order.map((name) => {
    const f = features.get(name)!;
    return {
      feature: name,
      evidenceIds: f.ids,
      transformedValue: f.value,
      weight: config.weights[name],
      contribution: f.value * config.weights[name],
    };
  });
  let value = reasons.reduce((sum, r) => sum + r.contribution, 0);
  if (!Number.isFinite(value)) throw new Error('Scoring contribution overflow');
  const adjustments: FamiliarityEstimate['adjustments'][number][] = [];
  function adjust(
    kind: FamiliarityEstimate['adjustments'][number]['kind'],
    after: number,
    items: readonly Evidence[] = [],
  ) {
    adjustments.push({
      kind,
      before: value,
      after,
      evidenceIds: items.map((e) => e.evidenceId).sort(compare),
    });
    value = after;
  }
  adjust('clamp', clamp(value));
  if (config.manual) {
    const report = evidence
      .filter((e) => e.type === 'recognition_report')
      .filter((e) => matchesScope(e.recognitionScope, question))
      .filter(
        (e) =>
          e.recognitionLevel !== 'intro' ||
          !e.recognitionScope ||
          question?.segmentKind === 'intro',
      )
      .sort(
        (a, b) =>
          scopeSpecificity(a) - scopeSpecificity(b) ||
          Date.parse(a.observedAt) - Date.parse(b.observedAt) ||
          compare(a.evidenceId, b.evidenceId),
      )
      .at(-1);
    if (report) {
      const level =
        report.recognitionLevel === 'intro' && !report.recognitionScope
          ? 'familiar'
          : report.recognitionLevel;
      adjust('selfReportFloor', Math.max(value, config.manual[level]), [
        report,
      ]);
      basis('recognitionReport', config.manual.confidence, [report]);
    }
  }
  const answers = evidence
    .filter((e) => 'eventId' in e)
    .sort(
      (a, b) =>
        Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
        compare(a.evidenceId, b.evidenceId),
    );
  const correct = answers
    .filter((e) => e.type === 'game_correct' || e.type === 'warmup_correct')
    .at(-1);
  if (correct)
    adjust(
      'correctFloor',
      Math.max(
        value,
        config.correctFloor *
          decay(correct.occurredAt, referenceTime, config.correctHalfLifeDays),
      ),
      [correct],
    );
  const answer = answers.at(-1);
  if (
    answer &&
    (answer.type === 'game_wrong' || answer.type === 'warmup_wrong')
  )
    adjust(
      'wrongPenalty',
      value -
        config.wrongPenalty *
          decay(answer.occurredAt, referenceTime, config.wrongHalfLifeDays),
      [answer],
    );
  adjust('clamp', clamp(value));
  for (const item of answers)
    basis(
      'recognition',
      config.confidence.recognition.base +
        config.confidence.recognition.gain *
          decay(
            item.occurredAt,
            referenceTime,
            config.confidence.recognitionHalfLifeDays,
          ),
      [item],
    );
  // Fixed insertion order resolves equal supports, independent of caller array order.
  const confidenceBasis = bases.reduce((best, next) =>
    next.value > best.value ? next : best,
  );
  return FamiliarityEstimateSchema.parse({
    familiarityScore: value,
    confidence: confidenceBasis.value,
    evidenceStatus:
      confidenceBasis.value > 0 &&
      confidenceBasis.value >= config.confidence.sufficientThreshold
        ? 'known'
        : 'insufficient',
    reasons,
    adjustments,
    confidenceBasis,
  });
}
