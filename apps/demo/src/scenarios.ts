import {
  createMixedFixture,
  createStressFixture,
  createNoCommonFixture,
  expandNoCommonFixture,
  MOCK_REFERENCE_TIME,
} from '@amp/adapters/fixtures';
import { CatalogSchema } from '@amp/core';
import { buildFamiliarityMatrix } from '@amp/music-profile';
import { session, ensure } from './session.js';
import {
  SCENARIOS,
  type ScenarioId,
  type DemoReport,
  type DemoBundle,
  type DemoRun,
} from './report.js';
async function mixed(): Promise<DemoRun[]> {
  const s = session('mixed', createMixedFixture());
  await s.prepare();
  ensure(s.state().currentPlaylist.length === 12, 'mixed has 12 unique songs');
  ensure(
    s.state().fairnessAssessment?.passed === false,
    'mixed warnings remain visible',
  );
  await s.send('告警不能自动开局', 'START_GAME', {}, 'ACK_REQUIRED');
  return [s.report()];
}
async function stress(): Promise<DemoRun[]> {
  const runs: DemoRun[] = [];
  for (const variant of ['feasible', 'missing-catalog'] as const) {
    const s = session('stress:' + variant, createStressFixture(variant));
    await s.prepare();
    const assessment = s.state().fairnessAssessment!;
    if (variant === 'feasible') {
      ensure(
        assessment.passed &&
          Object.values(assessment.playerMetrics).every(
            (m) => m.familiarCount === 9,
          ),
        'seven players have 9/12 familiar songs',
      );
    } else {
      ensure(
        !assessment.passed &&
          assessment.reasons.some((r) => r.code === 'LOW_COVERAGE'),
        'missing minority material warns',
      );
      await s.send('缺库暂停等待房主', 'START_GAME', {}, 'ACK_REQUIRED');
    }
    runs.push(s.report());
  }
  return runs;
}
async function ban(): Promise<DemoRun[]> {
  const fixture = createNoCommonFixture(),
    bans = createStressFixture().groups.classical;
  async function banned(runId: string) {
    const s = session(runId, fixture);
    await s.prepare();
    ensure(
      s.state().fairnessAssessment?.passed,
      'initial no-common fixture is feasible',
    );
    await s.send('房主开启禁歌', 'BEGIN_BAN');
    await s.send('禁歌期间不能开局', 'START_GAME', {}, 'BAN_OPEN');
    for (const songId of bans)
      await s.send('成员禁歌 ' + songId, 'BAN_SONG', { songId }, 'OK', {
        role: 'player',
        playerId: fixture.catalog.players[1]!.player.id,
      });
    await s.send('禁歌结束后重评', 'FINISH_BAN');
    ensure(
      s
        .state()
        .fairnessAssessment!.reasons.some((r) => r.code === 'LOW_COVERAGE'),
      'banning minority home causes genuine low coverage',
    );
    return s;
  }
  const continueRun = await banned('ban:continue');
  await continueRun.send('模拟房主知情继续', 'ACKNOWLEDGE_CONTINUE');
  ensure(
    continueRun.canStart().allowed &&
      !continueRun.state().fairnessAssessment!.passed,
    'current acknowledgement permits start without erasing warnings',
  );
  const acknowledged = continueRun.state().selectionVersion;
  await continueRun.send('重选失效旧确认', 'REGENERATE');
  continueRun.captureSelection('regenerated');
  await continueRun.send(
    '拒绝旧版本确认',
    'ACKNOWLEDGE_CONTINUE',
    { expectedVersion: acknowledged },
    'STALE_VERSION',
  );
  await continueRun.send(
    '重选后仍需当前房主选择',
    'START_GAME',
    {},
    'ACK_REQUIRED',
  );
  await continueRun.send('模拟房主确认新版本', 'ACKNOWLEDGE_CONTINUE');
  await continueRun.send('通过统一检查开局', 'START_GAME');
  await continueRun.finishGame();
  await continueRun.send('房主结束派对', 'END_PARTY');
  const runs = [continueRun.report()];
  for (const forMinority of [true, false]) {
    const s = await banned(
      forMinority ? 'ban:expand-minority' : 'ban:expand-majority',
    );
    await s.expand(expandNoCommonFixture(fixture, forMinority));
    ensure(
      s.state().bannedSongIds.length === 3 &&
        !s.state().currentPlaylist.some((id) => bans.includes(id)),
      'expansion does not unban songs',
    );
    if (forMinority)
      ensure(
        s.state().fairnessAssessment?.passed,
        'new unbanned minority material repairs coverage',
      );
    else {
      ensure(
        s
          .state()
          .fairnessAssessment?.reasons.some((r) => r.code === 'LOW_COVERAGE'),
        'majority-only expansion does not repair minority coverage',
      );
      await s.send('无效扩库仍暂停', 'START_GAME', {}, 'ACK_REQUIRED');
      await s.send(
        '明确更换尚无适配器的玩法',
        'CHANGE_GAME',
        { gameType: 'future-game' },
        'UNSUPPORTED_GAME',
      );
      await s.send('未知玩法不可开局', 'START_GAME', {}, 'UNSUPPORTED_GAME');
      await s.send('房主选择结束', 'END_PARTY');
    }
    runs.push(s.report());
  }
  return runs;
}
async function feedback(): Promise<DemoRun[]> {
  const fixture = createStressFixture();
  const coldStart = {
    ...fixture,
    catalog: CatalogSchema.parse({
      ...fixture.catalog,
      catalogVersion: 'feedback-cold-start-v1',
    }),
    rawData: fixture.rawData.map((raw, index) =>
      index === 0
        ? { ...raw, snapshotId: 'feedback:cold-start', evidence: [] }
        : raw,
    ),
  };
  const s = session('feedback', coldStart, {
    requestedCount: 2,
    answers: (_song, _player, index) =>
      index === 0 ? 'correct' : index === 1 ? 'wrong' : null,
  });
  await s.prepare();
  const before = s.state();
  ensure(
    before.fairnessAssessment?.validity,
    'feedback starts from a valid prepared party',
  );
  if (!before.fairnessAssessment.passed)
    await s.send('模拟房主确认短局告警', 'ACKNOWLEDGE_CONTINUE');
  const songId = before.currentPlaylist[0]!;
  await s.send('开始第一局', 'START_GAME');
  await s.finishGame();
  await s.replayFinish();
  const settled = s.state();
  ensure(
    settled.gameHistory[0]!.judgements.length === 4,
    'only two players answer two songs',
  );
  ensure(
    settled.playerProfiles[2]!.profileVersion ===
      before.playerProfiles[2]!.profileVersion,
    'no answer does not create wrong evidence',
  );
  await s.send('使用反馈和历史排除开始下一轮', 'START_NEXT_ROUND', {}, [
    'OK',
    'ACK_REQUIRED',
  ]);
  s.captureSelection('after-feedback');
  const after = s.state();
  if (after.phase === 'prepared') {
    ensure(
      after.hostAcknowledgement === null,
      'old acknowledgement is never reused',
    );
    await s.send('模拟房主确认下一轮告警', 'ACKNOWLEDGE_CONTINUE');
    await s.send('通过新评估开始下一轮', 'START_GAME');
  }
  const counterfactual = buildFamiliarityMatrix({
    catalog: before.catalog,
    profiles: before.playerProfiles,
    scoringConfig: before.config.scoring,
    referenceTime: after.referenceTime,
    matrixVersion: 'feedback:without-new-evidence',
  });
  for (const [index, action] of ['correct', 'wrong', 'none'].entries()) {
    const playerId = before.players[index]!.id;
    const first = before.matrix!.cells[playerId]![songId]!,
      last = after.matrix!.cells[playerId]![songId]!;
    const unchanged = counterfactual.cells[playerId]![songId]!;
    ensure(
      action === 'correct'
        ? last.familiarityScore > unchanged.familiarityScore
        : action === 'wrong'
          ? last.familiarityScore < unchanged.familiarityScore
          : last.familiarityScore === unchanged.familiarityScore,
      'feedback cell moves only with actual answer',
    );
    s.cellChanges.push({
      playerId,
      songId,
      action: action as 'correct' | 'wrong' | 'none',
      before: first,
      after: last,
      withoutFeedbackAtNextTime: unchanged,
      beforeTime: before.referenceTime,
      afterTime: after.referenceTime,
      profileVersionBefore: before.playerProfiles[index]!.profileVersion,
      profileVersionAfter: after.playerProfiles[index]!.profileVersion,
    });
  }
  ensure(
    after.currentRound === 2 &&
      after.matrix!.matrixVersion !== before.matrix!.matrixVersion,
    'next round uses a new matrix',
  );
  await s.finishGame();
  await s.send('结束反馈演示', 'END_PARTY');
  return [s.report()];
}
export async function runScenario(scenarioId: ScenarioId): Promise<DemoReport> {
  const runner = { mixed, stress, ban, feedback }[scenarioId];
  ensure(runner, 'known scenario');
  return {
    schemaVersion: 1,
    scenarioId,
    referenceTime: MOCK_REFERENCE_TIME,
    synthetic: true,
    actorSource: 'simulated_host',
    runs: await runner(),
  };
}
export async function runDemo(
  scenarios: readonly ScenarioId[] = SCENARIOS,
): Promise<DemoBundle> {
  const reports: DemoReport[] = [];
  for (const id of scenarios) reports.push(await runScenario(id));
  return { schemaVersion: 1, reports };
}
