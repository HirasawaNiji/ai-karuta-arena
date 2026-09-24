import { PartyStateSchema, type PartyState, type StartCheck } from '@amp/core';
import { assessPlaylist } from '@amp/playlist-engine';
import { canonical } from './util.js';
/** Display readiness is never an authorization token. Recompute the assessment. */
export function canStart(
  snapshot: PartyState,
  capabilities: readonly string[],
): StartCheck {
  const blockers: string[] = [];
  if (!PartyStateSchema.safeParse(snapshot).success)
    blockers.push('INVALID_INPUT');
  if (snapshot.phase !== 'prepared' || snapshot.activeGameSession !== null)
    blockers.push('INVALID_PHASE');
  if (snapshot.banPhase !== 'closed') blockers.push('BAN_OPEN');
  if (!capabilities.includes(snapshot.currentGame))
    blockers.push('UNSUPPORTED_GAME');
  const assessment = snapshot.fairnessAssessment;
  if (!snapshot.matrix || !snapshot.evaluationContext || !assessment)
    blockers.push('NOT_EVALUATED');
  else {
    try {
      const actual = assessPlaylist({
        playerIds: snapshot.players.map((p) => p.id),
        selectedSongIds: snapshot.currentPlaylist,
        matrix: snapshot.matrix,
        requestedCount: snapshot.requestedCount,
        fairnessConfig: snapshot.config.fairness,
        selectionVersion: snapshot.selectionVersion,
      });
      if (canonical(actual) !== canonical(assessment) || !actual.validity)
        blockers.push('INVALID_INPUT');
      else if (!actual.passed && !snapshot.hostAcknowledgement)
        blockers.push('ACK_REQUIRED');
    } catch {
      blockers.push('INVALID_INPUT');
    }
  }
  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    acknowledgedWarnings:
      blockers.length === 0
        ? (snapshot.hostAcknowledgement?.reasons ?? [])
        : [],
  };
}
