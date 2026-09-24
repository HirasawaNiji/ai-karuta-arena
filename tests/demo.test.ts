import { beforeAll, describe, expect, it } from 'vitest';
import {
  runCli,
  parseArgs,
  runDemo,
  SCENARIOS,
  renderText,
  type DemoBundle,
} from '@amp/demo';
let bundle: DemoBundle;
beforeAll(async () => {
  bundle = await runDemo();
}, 30000);
const run = (id: string) =>
  bundle.reports.flatMap((r) => r.runs).find((r) => r.runId === id)!;
describe('actual Demo composition', () => {
  it('runs all four scenarios in a stable order with synthetic identity and computed data', () => {
    expect(bundle.reports.map((r) => r.scenarioId)).toEqual(SCENARIOS);
    expect(
      bundle.reports.every(
        (r) => r.synthetic && r.actorSource === 'simulated_host',
      ),
    ).toBe(true);
    const mixed = run('mixed');
    expect(mixed.manifest.songCount).toBe(84);
    expect(mixed.profiles).toHaveLength(6);
    expect(mixed.profiles.every((p) => p.evidenceCount > 0)).toBe(true);
    expect(
      new Set(mixed.profiles.map((p) => JSON.stringify(p.preferences))).size,
    ).toBe(6);
    expect(mixed.selections[0]!.report.comparisons).toHaveLength(72);
    expect(mixed.finalState.assessment?.passed).toBe(false);
    expect(
      mixed.finalState.assessment?.reasons.filter(
        (r) => r.code === 'LOW_CONFIDENCE',
      ),
    ).toHaveLength(6);
  });
  it('shows both seven-player feasible coverage and genuine minority missing data', () => {
    const feasible = run('stress:feasible').finalState.assessment!,
      missing = run('stress:missing-catalog');
    expect(feasible.passed).toBe(true);
    expect(
      Object.values(feasible.playerMetrics).map((m) => m.familiarCount),
    ).toEqual([9, 9, 9, 9, 9, 9, 9]);
    expect(missing.finalState.assessment?.actualCount).toBe(3);
    expect(
      missing.finalState.assessment?.reasons.some(
        (r) => r.code === 'LOW_COVERAGE',
      ),
    ).toBe(true);
    expect(missing.steps.at(-1)?.outcome).toBe('ACK_REQUIRED');
    expect(missing.finalState.phase).toBe('prepared');
  });
  it('performs ban, explicit current-version confirmation, failed stale replay and actual settlement', () => {
    const ban = run('ban:continue');
    expect(ban.steps.some((s) => s.outcome === 'BAN_OPEN')).toBe(true);
    const confirmations = ban.steps.filter(
      (s) => s.command?.type === 'ACKNOWLEDGE_CONTINUE' && s.outcome === 'OK',
    );
    expect(confirmations).toHaveLength(2);
    expect(
      confirmations.every(
        (s) =>
          s.actorSource === 'simulated_host' &&
          s.state.assessment?.passed === false,
      ),
    ).toBe(true);
    expect(ban.steps.some((s) => s.outcome === 'STALE_VERSION')).toBe(true);
    expect(ban.finalState.bannedSongIds).toHaveLength(3);
    expect(ban.finalState.gameHistory).toHaveLength(1);
    expect(ban.finalState.gameHistory[0]!.playedSongIds).toHaveLength(9);
    expect(ban.finalState.phase).toBe('ended');
  });
  it('demonstrates that expansion can repair or fail, while bans remain', () => {
    const fixed = run('ban:expand-minority'),
      failed = run('ban:expand-majority');
    expect(fixed.finalState.assessment?.passed).toBe(true);
    expect(
      fixed.finalState.currentPlaylist.filter((id) =>
        id.startsWith('new-song:'),
      ),
    ).toHaveLength(3);
    for (const r of [fixed, failed])
      expect(
        r.finalState.currentPlaylist.some((id) =>
          r.finalState.bannedSongIds.includes(id),
        ),
      ).toBe(false);
    expect(
      failed.selections
        .at(-1)!
        .report.assessment.reasons.some((r) => r.code === 'LOW_COVERAGE'),
    ).toBe(true);
    expect(
      failed.steps.filter((s) => s.outcome === 'UNSUPPORTED_GAME'),
    ).toHaveLength(2);
    expect(failed.finalState.phase).toBe('ended');
  });
  it('settles feedback exactly once, distinguishes no-answer from time decay and runs the next round', () => {
    const feedback = run('feedback');
    expect(feedback.cellChanges.map((c) => c.action)).toEqual([
      'correct',
      'wrong',
      'none',
    ]);
    for (const cell of feedback.cellChanges) {
      const counter = cell.withoutFeedbackAtNextTime.familiarityScore;
      if (cell.action === 'correct') {
        expect(cell.after.familiarityScore).toBeGreaterThan(counter);
        expect(cell.profileVersionAfter).toBeGreaterThan(
          cell.profileVersionBefore,
        );
      } else if (cell.action === 'wrong')
        expect(cell.after.familiarityScore).toBeLessThan(counter);
      else {
        expect(cell.after).toEqual(cell.withoutFeedbackAtNextTime);
        expect(cell.profileVersionAfter).toBe(cell.profileVersionBefore);
      }
    }
    expect(feedback.finalState.gameHistory).toHaveLength(2);
    expect(feedback.finalState.currentRound).toBe(2);
    expect(feedback.events.counts.GAME_FINISHED).toBe(2);
    expect(feedback.events.acceptedCount).toBe(feedback.events.emittedCount);
    expect(
      feedback.finalState.gameHistory.every((g) => g.judgements.length === 4),
    ).toBe(true);
    expect(
      feedback.events.judgements.some((j) => j.playerId === 'player:stress-3'),
    ).toBe(false);
    expect(feedback.finalState.excludedHistorySongIds).toHaveLength(2);
  });
  it('is byte-for-byte deterministic for fixed full inputs', async () => {
    expect(JSON.stringify(await runDemo())).toBe(JSON.stringify(bundle));
  }, 30000);
  it('renders text from the same report without inventing numbers or suppressed warnings', () => {
    const text = renderText(bundle);
    for (const r of bundle.reports)
      expect(text).toContain('[' + r.scenarioId + ']');
    for (const c of run('feedback').cellChanges) {
      expect(text).toContain(
        c.before.familiarityScore.toFixed(6) +
          ' → ' +
          c.after.familiarityScore.toFixed(6),
      );
    }
    expect(text).toContain('LOW_COVERAGE');
    expect(text).toContain('simulated_host');
  });
});
describe('strict CLI options', () => {
  it.each(SCENARIOS)('selects %s with both pnpm argument spellings', (id) => {
    for (const prefix of [[], ['--']])
      expect(
        parseArgs([...prefix, '--scenario', id, '--format', 'json']),
      ).toEqual({ scenarios: [id], format: 'json', help: false });
  });
  it('defaults to all and provides explicit help', () => {
    expect(parseArgs([])).toEqual({
      scenarios: SCENARIOS,
      format: 'text',
      help: false,
    });
    expect(parseArgs(['--help']).help).toBe(true);
  });
  it.each([
    ['--scenario'],
    ['--scenario', 'other'],
    ['--format', 'xml'],
    ['--format'],
    ['--unknown'],
    ['--scenario', 'mixed', '--scenario', 'ban'],
    ['--format', 'json', '--format', 'text'],
    ['--help', '--format', 'json'],
    ['extra'],
    ['--', '--'],
  ])('rejects invalid argv %j', (...args) => {
    expect(() => parseArgs(args)).toThrow();
  });
});

it('unexpected orchestration failure emits no partial JSON and returns exit 1', async () => {
  let stdout = '',
    stderr = '';
  const code = await runCli(
    ['--format', 'json'],
    {
      stdout: (value) => {
        stdout += value;
      },
      stderr: (value) => {
        stderr += value;
      },
    },
    () => Promise.reject(new Error('controlled failure')),
  );
  expect(code).toBe(1);
  expect(stdout).toBe('');
  expect(stderr).toContain('Demo failed: controlled failure');
});
