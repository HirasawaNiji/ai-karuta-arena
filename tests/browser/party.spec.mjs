/* global fetch */
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  room,
  ready,
  prepareDuel,
  play,
  view,
  responseStatus,
  confirm,
  assertNoOverflow,
} from './helpers.mjs';

test.beforeAll(async ({ browser }) => {
  const session = await browser.newBrowserCDPSession();
  const command = await session.send('Browser.getBrowserCommandLine');
  expect(command.arguments).toContain('--mute-audio');
  await session.detach();
});

for (const preset of ['quick', 'standard'])
  test(
    'real UI completes ' + preset + ' duel with audio, claims and transfer',
    async ({ browser, baseURL }, testInfo) => {
      const r = await room(browser, baseURL, 2);
      let late;
      try {
        await ready(r.clients, 'duel', preset);
        await prepareDuel(r.clients, preset);
        const opening = (await view(r.clients[0].page, '/api/duel')).game;
        expect(Object.values(opening.hands).map((hand) => hand.length)).toEqual(
          preset === 'quick' ? [10, 10] : [15, 15],
        );
        late = await room(browser, baseURL, 1, {
          code: r.clients[0].code,
          nicknameOffset: 2,
        });
        const newcomer = late.clients[0];
        await expect(
          newcomer.page.getByRole('button', {
            name: '等待下一局',
            exact: true,
          }),
        ).toBeDisabled();
        const frozen = await view(newcomer.page, '/api/duel');
        const denied = await newcomer.page.evaluate(
          async (command) => {
            const response = await fetch('/api/duel/prepare', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(command),
            });
            return { status: response.status, body: await response.json() };
          },
          {
            type: 'interrupt',
            actionId: randomUUID(),
            expectedVersion: frozen.version,
          },
        );
        expect(denied).toEqual({
          status: 400,
          body: { error: '请等待下一局' },
        });
        const continued = (await view(r.clients[0].page, '/api/duel')).game;
        expect(continued.gameSessionId).toBe(opening.gameSessionId);
        expect(['aborted', 'completed']).not.toContain(continued.phase);
        expect(Object.keys(continued.scores)).not.toContain(newcomer.id);
        const result = await play(r.clients[0], r.clients[0], '/api/duel');
        expect(result.game.winnerId).toBe(r.clients[0].id);
        expect(result.game.hands[r.clients[0].id]).toHaveLength(0);
        expect(result.transfers).toBeGreaterThan(0);
        for (const c of r.clients) {
          await expect(
            c.page.getByRole('heading', {
              name: '测试好友0 清空手牌，获胜！',
              exact: true,
            }),
          ).toBeVisible();
          expect((await view(c.page, '/api/duel')).game).toEqual(result.game);
        }
        await assertNoOverflow(r.clients[0].page);
        expect(
          (await view(r.clients[0].page, '/api/profile')).profile
            .profileVersion,
        ).toBeGreaterThan(1);
        expect([...r.errors, ...late.errors]).toEqual([]);
        await testInfo.attach('duel-result', {
          body: JSON.stringify(result),
          contentType: 'application/json',
        });
      } finally {
        await late?.close();
        await r.close();
      }
    },
  );

test('three clients complete multiplayer with wrong-answer lock and tied ranks', async ({
  browser,
  baseURL,
}, testInfo) => {
  const r = await room(browser, baseURL, 3),
    [host, wrong, passive] = r.clients;
  try {
    await ready(r.clients, 'multiplayer');
    await host.page
      .getByRole('button', { name: '生成多人题组', exact: true })
      .click();
    for (const c of r.clients) {
      await c.page.locator('button.song-card').first().click();
      await c.page
        .getByRole('button', { name: '确认禁歌', exact: true })
        .click();
    }
    await confirm(r.clients, host);
    await expect
      .poll(async () => (await view(host.page, '/api/multiplayer')).game?.phase)
      .toBe('playing');
    const state = await view(host.page, '/api/multiplayer');
    // The guest's real browser session cannot read the shared speaker's audio.
    expect(
      await responseStatus(
        wrong.page,
        '/api/multiplayer/audio/' + state.game.round.token,
      ),
    ).toBe(403);
    expect(JSON.stringify(state)).not.toMatch(/questionId|recordingId|seed/);
    await expect
      .poll(() => host.audio.get(state.game.round.token))
      .toBeTruthy();
    const currentTitle = host.audio.get(state.game.round.token);
    const titles = await wrong.page
      .locator('button.song-card')
      .allTextContents();
    await wrong.page
      .getByRole('button', {
        name: titles.find((t) => t !== currentTitle),
        exact: true,
      })
      .click();
    await expect(
      wrong.page.getByText('这次没猜中，下一题再试。', { exact: true }),
    ).toBeVisible();
    const result = await play(host, host, '/api/multiplayer');
    expect(result.game.scores[host.id]).toBe(12);
    expect(
      result.game.standings.find((s) => s.playerId === wrong.id).rank,
    ).toBe(2);
    expect(
      result.game.standings.find((s) => s.playerId === passive.id).rank,
    ).toBe(2);
    for (const c of r.clients) {
      await expect(
        c.page.getByRole('heading', {
          name: '这一场，我们的音乐默契',
          exact: true,
        }),
      ).toBeVisible();
      expect((await view(c.page, '/api/multiplayer')).game.standings).toEqual(
        result.game.standings,
      );
    }
    expect(r.errors).toEqual([]);
    await testInfo.attach('multiplayer-result', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
  } finally {
    await r.close();
  }
});

for (const size of [4, 8])
  test(
    size + ' clients complete a tournament with an eliminated organizer',
    async ({ browser, baseURL }, testInfo) => {
      // Seven real-clock matches need a larger total budget, not longer UI waits.
      if (size === 8) test.setTimeout(420_000);
      const r = await room(browser, baseURL, size),
        host = r.clients[0];
      try {
        await ready(r.clients, 'tournament');
        await host.page
          .getByRole('button', {
            name: '创建 ' + size + ' 人淘汰赛',
            exact: true,
          })
          .click();
        const initial = (await view(host.page, '/api/tournament')).state;
        const frozen = initial.entrants;
        expect(frozen).toHaveLength(size);
        expect(initial.matches).toHaveLength(size - 1);
        for (let round = 1; round <= Math.log2(size); round++)
          expect(initial.matches.filter((m) => m.round === round)).toHaveLength(
            size / 2 ** round,
          );
        for (const label of size === 8
          ? ['八强赛', '半决赛', '决赛']
          : ['半决赛', '决赛'])
          await expect(
            host.page.getByRole('heading', { name: label, exact: true }),
          ).toBeVisible();
        let eliminatedHost = false,
          scheduledAfterElimination = 0;
        for (let i = 0; i < size - 1; i++) {
          if (eliminatedHost) scheduledAfterElimination++;
          await host.page
            .getByRole('button', { name: '安排本场', exact: true })
            .first()
            .click();
          const before = await view(host.page, '/api/tournament');
          const match = before.state.matches.find(
            (m) => m.matchId === before.state.currentMatchId,
          );
          expect(match.status).toBe('preparing');
          for (const source of match.sources) {
            const upstream = before.state.matches.find(
              (m) => m.matchId === source,
            );
            expect(upstream.status).toBe('completed');
            expect(match.playerIds).toContain(upstream.winnerId);
          }
          const pair = match.playerIds.map((id) =>
            r.clients.find((c) => c.id === id),
          );
          await prepareDuel(pair, 'quick', { start: false });
          for (const c of pair) {
            const prepared = (await view(c.page, '/api/tournament'))
              .preparation;
            expect(prepared.canStart).toBe(true);
            expect(prepared.acknowledged).toBe(true);
            expect(new Set(prepared.readyPlayerIds)).toEqual(
              new Set(match.playerIds),
            );
            expect(prepared.cards).toHaveLength(20);
            expect(
              Object.values(prepared.finalHands).map((h) => h.length),
            ).toEqual([10, 10]);
            expect(
              prepared.ownSelection.every(
                (s) => !before.state.exposedSongIds.includes(s),
              ),
            ).toBe(true);
          }
          await pair[0].page
            .getByRole('button', { name: '开始听歌', exact: true })
            .click();
          const opening = (await view(pair[0].page, '/api/tournament'))
            .preparation.game;
          expect(new Set(Object.keys(opening.hands))).toEqual(
            new Set(match.playerIds),
          );
          for (const c of r.clients.filter((c) => !pair.includes(c))) {
            await expect(
              c.page.getByRole('heading', { name: '正在旁观', exact: true }),
            ).toBeVisible();
            await expect(c.page.locator('button.song-card')).toHaveCount(0);
          }
          const winner = pair.find((c) => c !== host) ?? pair[0];
          if (pair.includes(host)) eliminatedHost = true;
          const result = await play(pair[0], winner, '/api/tournament');
          expect(result.game.winnerId).toBe(winner.id);
          await expect
            .poll(
              async () =>
                (await view(host.page, '/api/tournament')).state.matches.filter(
                  (m) => m.status === 'completed',
                ).length,
            )
            .toBe(i + 1);
          const after = (await view(host.page, '/api/tournament')).state;
          expect(after.entrants).toEqual(frozen);
          expect(after.allowRepeats).toBe(false);
          expect(after.exposedSongIds.length).toBeGreaterThan(
            before.state.exposedSongIds.length,
          );
          expect(new Set(after.exposedSongIds).size).toBe(
            after.exposedSongIds.length,
          );
          expect(
            (await view(winner.page, '/api/profile')).profile.profileVersion,
          ).toBeGreaterThan(
            frozen.find((p) => p.id === winner.id).profileVersion,
          );
        }
        expect(eliminatedHost).toBe(true);
        expect(scheduledAfterElimination).toBeGreaterThan(0);
        const final = await view(host.page, '/api/tournament');
        expect(final.state.status).toBe('completed');
        expect(final.state.matches.every((m) => m.status === 'completed')).toBe(
          true,
        );
        expect(final.state.entrants).toEqual(frozen);
        expect(final.state.audit).toEqual([]);
        expect(final.state.championId).not.toBe(host.id);
        expect(final.state.exposedSongIds.length).toBeGreaterThan(20);
        expect(final.availableCount).toBe(
          84 - final.state.exposedSongIds.length,
        );
        const champion = final.state.entrants.find(
          (p) => p.id === final.state.championId,
        ).nickname;
        for (const c of r.clients) {
          await expect(
            c.page.getByRole('heading', {
              name: '本届冠军 · ' + champion,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            c.page.locator('summary').filter({
              hasText:
                '查看完整对阵（' +
                (size - 1) +
                '/' +
                (size - 1) +
                ' 场已完成）',
            }),
          ).toBeVisible();
          expect((await view(c.page, '/api/tournament')).state).toEqual(
            final.state,
          );
        }
        expect(r.errors).toEqual([]);
        await testInfo.attach('tournament-result', {
          body: JSON.stringify(final.state),
          contentType: 'application/json',
        });
      } finally {
        await r.close();
      }
    },
  );

test('failed audio leaves profiles unchanged and permits a fresh completed duel', async ({
  browser,
  baseURL,
}) => {
  const r = await room(browser, baseURL, 2);
  try {
    await ready(r.clients);
    await r.clients[0].page.route('**/api/duel/audio/**', (route) =>
      route.abort('failed'),
    );
    await prepareDuel(r.clients);
    for (const c of r.clients) {
      await expect(
        c.page.getByRole('heading', { name: '本局已中断', exact: true }),
      ).toBeVisible();
      expect((await view(c.page, '/api/profile')).profile.profileVersion).toBe(
        1,
      );
    }
    const host = r.clients[0];
    const interrupted = (await view(host.page, '/api/duel')).game.gameSessionId;
    await host.page.unroute('**/api/duel/audio/**');
    await host.page
      .getByRole('button', { name: '再来一局', exact: true })
      .click();
    const reset = await view(host.page, '/api/duel');
    expect(reset.readyPlayerIds).toEqual([]);
    expect(reset.canStart).toBe(false);
    await prepareDuel(r.clients);
    const result = await play(host, host, '/api/duel');
    expect(result.game.gameSessionId).not.toBe(interrupted);
    expect(result.game.winnerId).toBe(host.id);
    for (const c of r.clients)
      await expect(
        c.page.getByRole('heading', {
          name: '测试好友0 清空手牌，获胜！',
          exact: true,
        }),
      ).toBeVisible();
    expect(
      (await view(host.page, '/api/profile')).profile.profileVersion,
    ).toBeGreaterThan(1);
    expect(r.errors).toEqual([]);
  } finally {
    await r.close();
  }
});
