import {
  type PartyState,
  type PartyCommand,
  type PartyActor,
  type FairnessAssessment,
  type HostDecision,
  type GameEvent,
  type FamiliarityEstimate,
  type PartyConfig,
} from '@amp/core';
import { type SelectionReport } from '@amp/playlist-engine';
import { type coverageManifest } from '@amp/adapters/fixtures';
export const SCENARIOS = ['mixed', 'stress', 'ban', 'feedback'] as const;
export type ScenarioId = (typeof SCENARIOS)[number];
export interface StateSummary {
  readonly phase: PartyState['phase'];
  readonly hostState: PartyState['hostState'];
  readonly banPhase: PartyState['banPhase'];
  readonly selectionVersion: number;
  readonly currentRound: number;
  readonly referenceTime: string;
  readonly currentGame: string;
  readonly catalogVersion: string;
  readonly candidateCount: number;
  readonly requestedCount: number;
  readonly currentPlaylist: PartyState['currentPlaylist'];
  readonly bannedSongIds: PartyState['bannedSongIds'];
  readonly excludedHistorySongIds: PartyState['excludedHistorySongIds'];
  readonly profileVersions: Readonly<Record<string, number>>;
  readonly matrixVersion: string | null;
  readonly assessment: FairnessAssessment | null;
  readonly acknowledgement: PartyState['hostAcknowledgement'];
  readonly activeSessionId: string | null;
  readonly processedEventCount: number;
  readonly pendingEvidenceCount: number;
  readonly gameHistory: PartyState['gameHistory'];
}
export function summarize(s: PartyState): StateSummary {
  return {
    phase: s.phase,
    hostState: s.hostState,
    banPhase: s.banPhase,
    selectionVersion: s.selectionVersion,
    currentRound: s.currentRound,
    referenceTime: s.referenceTime,
    currentGame: s.currentGame,
    catalogVersion: s.catalogVersion,
    candidateCount: s.candidateSongIds.length,
    requestedCount: s.requestedCount,
    currentPlaylist: s.currentPlaylist,
    bannedSongIds: s.bannedSongIds,
    excludedHistorySongIds: s.excludedHistorySongIds,
    profileVersions: Object.fromEntries(
      s.playerProfiles.map((p) => [p.playerId, p.profileVersion]),
    ),
    matrixVersion: s.matrix?.matrixVersion ?? null,
    assessment: s.fairnessAssessment,
    acknowledgement: s.hostAcknowledgement,
    activeSessionId: s.activeGameSession?.gameSessionId ?? null,
    processedEventCount: s.processedEventIds.length,
    pendingEvidenceCount: s.pendingGameplayEvidence.length,
    gameHistory: s.gameHistory,
  };
}
export interface DemoStep {
  readonly label: string;
  readonly command: PartyCommand | null;
  readonly actor: PartyActor | null;
  readonly actorSource:
    'simulated_host' | 'simulated_member' | 'trusted_demo_system' | 'mock_game';
  readonly outcome: string;
  readonly state: StateSummary;
}
export interface CellChange {
  readonly playerId: string;
  readonly songId: string;
  readonly action: 'correct' | 'wrong' | 'none';
  readonly before: FamiliarityEstimate;
  readonly after: FamiliarityEstimate;
  readonly withoutFeedbackAtNextTime: FamiliarityEstimate;
  readonly beforeTime: string;
  readonly afterTime: string;
  readonly profileVersionBefore: number;
  readonly profileVersionAfter: number;
}
export interface DemoRun {
  readonly runId: string;
  readonly dataVersion: string;
  readonly config: PartyConfig;
  readonly referenceTime: string;
  readonly manifest: ReturnType<typeof coverageManifest>;
  readonly profiles: readonly {
    readonly playerId: string;
    readonly preferences: PartyState['playerProfiles'][number]['preferences'];
    readonly evidenceCount: number;
  }[];
  readonly steps: readonly DemoStep[];
  readonly selections: readonly {
    readonly label: string;
    readonly report: SelectionReport;
  }[];
  readonly hostDecisions: readonly HostDecision[];
  readonly events: {
    readonly counts: Readonly<Record<string, number>>;
    readonly emittedCount: number;
    readonly acceptedCount: number;
    readonly judgements: readonly Extract<
      GameEvent,
      { type: 'ANSWER_CORRECT' | 'ANSWER_WRONG' }
    >[];
  };
  readonly cellChanges: readonly CellChange[];
  readonly finalState: StateSummary;
}
export interface DemoReport {
  readonly schemaVersion: 1;
  readonly scenarioId: ScenarioId;
  readonly referenceTime: string;
  readonly synthetic: true;
  readonly actorSource: 'simulated_host';
  readonly runs: readonly DemoRun[];
}
export interface DemoBundle {
  readonly schemaVersion: 1;
  readonly reports: readonly DemoReport[];
}
export function renderText(bundle: DemoBundle): string {
  const lines = [
    'AI 音乐派对 · 无密钥核心 Demo',
    '合成元数据 / 模拟房主与游戏；无真实音频、联网或真人游玩验收。',
  ];
  for (const report of bundle.reports) {
    lines.push('', '[' + report.scenarioId + '] ' + report.referenceTime);
    for (const run of report.runs) {
      lines.push(
        '场景 ' +
          run.runId +
          ' | 数据 ' +
          run.dataVersion +
          ' | ' +
          run.manifest.songCount +
          ' 首 / ' +
          run.manifest.playerCount +
          ' 人',
        '配置 ' +
          run.config.scoring.version +
          ' / ' +
          run.config.selection.version +
          ' / ' +
          run.config.fairness.version,
      );
      for (const step of run.steps) {
        const s = step.state;
        lines.push(
          '  ' +
            step.label +
            '：' +
            step.outcome +
            '，' +
            s.phase +
            '，v' +
            s.selectionVersion +
            '，' +
            s.currentPlaylist.length +
            '/' +
            s.requestedCount +
            ' 首，actorSource=' +
            step.actorSource,
        );
        if (s.assessment) {
          lines.push(
            '    评估 ' +
              (s.assessment.passed ? '通过' : '告警') +
              '：' +
              (s.assessment.reasons
                .map(
                  (r) =>
                    r.code + ('playerId' in r ? '(' + r.playerId + ')' : ''),
                )
                .join(', ') || '无告警'),
          );
          lines.push(
            '    熟悉数 ' +
              Object.entries(s.assessment.playerMetrics)
                .map(
                  ([id, m]) =>
                    id +
                    '=' +
                    m.familiarCount +
                    '/' +
                    s.assessment!.actualCount,
                )
                .join('；'),
          );
        }
      }
      for (const selection of run.selections) {
        lines.push(
          '  选曲解释 ' + selection.label + '：' + selection.report.message,
        );
        for (const [index, step] of selection.report.result.steps.entries())
          lines.push(
            '    ' +
              (index + 1) +
              '. ' +
              step.songId +
              ' 补缺收益=' +
              step.deficitGain +
              ' 综合增益=' +
              step.totalGain.toFixed(6) +
              ' 决胜=' +
              step.tieBreak.rule +
              ' 熟悉玩家=' +
              (selection.report.songs
                .find((song) => song.songId === step.songId)
                ?.familiarPlayerIds.join(',') || '无'),
          );
      }
      for (const decision of run.hostDecisions)
        lines.push('  主持：' + decision.message);
      for (const cell of run.cellChanges)
        lines.push(
          '  反馈 ' +
            cell.playerId +
            ' / ' +
            cell.songId +
            ' [' +
            cell.action +
            '] 熟悉度 ' +
            cell.before.familiarityScore.toFixed(6) +
            ' → ' +
            cell.after.familiarityScore.toFixed(6) +
            '；可信度 ' +
            cell.before.confidence.toFixed(6) +
            ' → ' +
            cell.after.confidence.toFixed(6) +
            '；下一轮同时刻无新答题证据=' +
            cell.withoutFeedbackAtNextTime.familiarityScore.toFixed(6),
        );
      lines.push(
        '  事件 emitted=' +
          run.events.emittedCount +
          ' accepted=' +
          run.events.acceptedCount +
          '；已结算 ' +
          run.finalState.gameHistory.length +
          ' 局；最终 ' +
          run.finalState.phase,
      );
    }
  }
  return lines.join('\n') + '\n';
}
