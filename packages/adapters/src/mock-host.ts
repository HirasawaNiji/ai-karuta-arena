import {
  HostContextSchema,
  type HostContext,
  type HostDecision,
  type PartyHostAgent,
} from '@amp/core';
/** Suggestions only. This agent never dispatches commands or acknowledges warnings. */
export class MockPartyHostAgent implements PartyHostAgent {
  decide(raw: HostContext): Promise<HostDecision> {
    const {
      snapshot: s,
      assessment,
      gameResult,
    } = HostContextSchema.parse(raw);
    const reasonCodes = assessment?.reasons.map((r) => r.code) ?? [];
    let action: HostDecision['action'] = 'REQUEST_HOST_CHOICE';
    let message = '请房主选择后续操作。';
    if (s.phase === 'setup') {
      action = 'GENERATE_PLAYLIST';
      message = '画像加载后可以生成题组。';
    } else if (s.phase === 'ended') {
      action = 'END_PARTY';
      message = '派对已结束。';
    } else if (s.phase === 'finished') {
      action = 'SHOW_RESULT';
      message =
        '本局已结算，正确判定共 ' +
        (gameResult?.judgements.filter((j) => j.outcome === 'correct').length ??
          0) +
        ' 次。';
    } else if (
      s.phase === 'prepared' &&
      s.hostState === 'ready' &&
      s.banPhase === 'closed' &&
      assessment?.validity &&
      (assessment.passed || s.hostAcknowledgement)
    ) {
      action = 'START_GAME';
      message = '可以请求开局，运行时仍将检查当前条件。';
    } else if (assessment)
      message =
        '请求 ' +
        assessment.requestedCount +
        ' 首，实际 ' +
        assessment.actualCount +
        ' 首。当前原因：' +
        reasonCodes.join('、') +
        '。可扩库重选、调整玩法、结束，或在有效非空题组下由房主知情继续。';
    return Promise.resolve({
      action,
      reason: reasonCodes.join('、') || 'CURRENT_PARTY_STATE',
      message,
      reasonCodes,
    });
  }
}
