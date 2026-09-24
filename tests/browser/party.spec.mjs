import { test, expect } from '@playwright/test';
import {
  room,
  ready,
  prepareDuel,
  play,
  view,
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
      try {
        await ready(r.clients, 'duel', preset);
        await prepareDuel(r.clients, preset);
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
        expect(r.errors).toEqual([]);
        await testInfo.attach('duel-result', {
          body: JSON.stringify(result),
          contentType: 'application/json',
        });
      } finally {
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

test('four clients play both semifinals and final with an eliminated organizer', async ({
  browser,
  baseURL,
}, testInfo) => {
  const r = await room(browser, baseURL, 4),
    host = r.clients[0];
  try {
    await ready(r.clients, 'tournament');
    await host.page
      .getByRole('button', { name: '创建 4 人淘汰赛', exact: true })
      .click();
    const frozen = (await view(host.page, '/api/tournament')).state.entrants;
    let eliminatedHost = false;
    for (let i = 0; i < 3; i++) {
      await host.page
        .getByRole('button', { name: '安排本场', exact: true })
        .first()
        .click();
      const before = await view(host.page, '/api/tournament');
      const match = before.state.matches.find(
        (m) => m.matchId === before.state.currentMatchId,
      );
      const pair = match.playerIds.map((id) =>
        r.clients.find((c) => c.id === id),
      );
      await prepareDuel(pair);
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
    }
    expect(eliminatedHost).toBe(true);
    const final = await view(host.page, '/api/tournament');
    expect(final.state.status).toBe('completed');
    expect(final.state.entrants).toEqual(frozen);
    expect(final.state.championId).not.toBe(host.id);
    expect(final.state.exposedSongIds.length).toBeGreaterThan(20);
    expect(final.availableCount).toBe(84 - final.state.exposedSongIds.length);
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
});

test('failed audio interrupts both clients without changing profiles', async ({
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
    expect(r.errors).toEqual([]);
  } finally {
    await r.close();
  }
});
