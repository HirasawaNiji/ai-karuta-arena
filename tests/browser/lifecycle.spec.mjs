import { test, expect } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import { room, ready, prepareDuel, confirm, play, view } from './helpers.mjs';

test.beforeAll(async ({ browser }) => {
  const cdp = await browser.newBrowserCDPSession();
  expect((await cdp.send('Browser.getBrowserCommandLine')).arguments).toContain(
    '--mute-audio',
  );
  await cdp.detach();
});
const button = (page, name) => page.getByRole('button', { name, exact: true });
const familiarity = (page, title) =>
  page
    .locator('.song-row')
    .filter({ has: page.getByText(title, { exact: true }) })
    .getByRole('combobox');
const profile = (client) => view(client.page, '/api/profile');
async function lobby(clients) {
  for (const c of clients) await button(c.page, '02 好友大厅').click();
}
async function multiplayer(clients) {
  await button(clients[0].page, '生成多人题组').click();
  for (const c of clients) await button(c.page, '不禁歌，继续').click();
  await confirm(clients, clients[0]);
  await expect
    .poll(
      async () => (await view(clients[0].page, '/api/multiplayer')).game?.phase,
    )
    .toBe('playing');
}

test('independent tag and song profiles survive reload and lower self-report replaces old evidence', async ({
  browser,
  baseURL,
}) => {
  const r = await room(browser, baseURL, 2, {
    beforeEnter: async (page) => {
      // A slow initial profile response must never erase a user's fast input.
      await page.route(
        '**/api/profile',
        async (route) => {
          await delay(2000);
          await route.continue();
        },
        { times: 1 },
      );
    },
    onProfile: async (page, index) => {
      if (index === 0) await button(page, '测试音').click();
      else {
        await familiarity(page, '合成测试音 001').selectOption('heard');
        await familiarity(page, '合成测试音 002').selectOption('familiar');
        await familiarity(page, '合成测试音 003').selectOption('intro');
      }
      await button(page, '保存偏好，进入大厅').click();
      await expect(button(page, '我已完成入场，准备好了')).toBeVisible();
    },
  });
  try {
    const [tagPlayer, songPlayer] = r.clients;
    const tag = await profile(tagPlayer),
      songs = await profile(songPlayer);
    expect(
      tag.profile.preferences.languages['lang:instrumental'],
    ).toMatchObject({ weight: 0.8, confidence: 0.4 });
    expect(tag.profile.songEvidence).toEqual({});
    expect(
      Object.values(songs.profile.preferences).every(
        (dimension) => Object.keys(dimension).length === 0,
      ),
    ).toBe(true);
    for (const [id, level, score] of [
      ['test-song:0', 'heard', 0.25],
      ['test-song:1', 'familiar', 0.65],
      ['test-song:2', 'intro', 0.65],
    ]) {
      expect(songs.profile.songEvidence[id]).toHaveLength(1);
      expect(songs.profile.songEvidence[id][0]).toMatchObject({
        type: 'recognition_report',
        recognitionLevel: level,
      });
      expect(
        songs.profile.songEvidence[id][0].recognitionScope,
      ).toBeUndefined();
      expect(songs.estimates[id].familiarityScore).toBeCloseTo(score);
    }
    for (const [c, saved] of [
      [tagPlayer, tag],
      [songPlayer, songs],
    ]) {
      await c.page.reload();
      await expect(button(c.page, '修改音乐偏好')).toBeVisible();
      expect((await view(c.page, '/api/session')).playerId).toBe(c.id);
      expect((await profile(c)).profile).toEqual(saved.profile);
      await button(c.page, '修改音乐偏好').click();
    }
    await expect(button(tagPlayer.page, '测试音')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(familiarity(songPlayer.page, '合成测试音 003')).toHaveValue(
      'intro',
    );
    await familiarity(songPlayer.page, '合成测试音 002').selectOption('heard');
    await familiarity(songPlayer.page, '合成测试音 003').selectOption('');
    await button(songPlayer.page, '保存偏好，进入大厅').click();
    await expect
      .poll(async () => (await profile(songPlayer)).profile.profileVersion)
      .toBeGreaterThan(songs.profile.profileVersion);
    const reduced = await profile(songPlayer);
    expect(reduced.estimates['test-song:1'].familiarityScore).toBeCloseTo(0.25);
    expect(reduced.profile.songEvidence['test-song:1']).toHaveLength(1);
    expect(reduced.profile.songEvidence['test-song:2']).toBeUndefined();
    expect(r.errors).toEqual([]);
  } finally {
    await r.close();
  }
});

test('preset and profile changes invalidate final confirmation before a fresh start', async ({
  browser,
  baseURL,
}) => {
  const r = await room(browser, baseURL, 2),
    host = r.clients[0];
  try {
    await ready(r.clients);
    await prepareDuel(r.clients, 'quick', { start: false });
    const original = await view(host.page, '/api/duel');
    expect(original.canStart).toBe(true);
    expect(original.readyPlayerIds).toHaveLength(2);
    expect(original.acknowledged).toBe(true);
    await lobby(r.clients);
    await button(
      host.page,
      '标准局 · 15 对 15 每人选 18 · BAN 3 · 不追加空牌',
    ).click();
    async function invalidated(previous) {
      await expect
        .poll(async () => (await view(host.page, '/api/duel')).phase)
        .toBe('idle');
      const current = await view(host.page, '/api/duel');
      expect(current.version).toBeGreaterThan(previous.version);
      expect(current.readyPlayerIds).toEqual([]);
      expect(current.acknowledged).toBe(false);
      expect(current.canStart).toBe(false);
      expect(current.game).toBeNull();
      expect(
        (await view(host.page, '/api/session')).room.members.every(
          (m) => !m.lobbyReady,
        ),
      ).toBe(true);
      await button(host.page, '03 听歌抢牌').click();
      await expect(button(host.page, '开始选歌')).toBeDisabled();
      await button(host.page, '02 好友大厅').click();
    }
    await invalidated(original);
    expect((await view(host.page, '/api/duel')).preset).toBe('standard');
    await ready(r.clients, 'duel', 'standard');
    await prepareDuel(r.clients, 'standard', { start: false });
    const standard = await view(host.page, '/api/duel');
    expect(standard.canStart).toBe(true);
    await button(host.page, '01 音乐偏好').click();
    await button(host.page, '测试音').click();
    await button(host.page, '保存偏好，进入大厅').click();
    await invalidated(standard);
    await lobby(r.clients);
    await ready(r.clients, 'duel', 'standard');
    await prepareDuel(r.clients, 'standard');
    await expect
      .poll(async () => (await view(host.page, '/api/duel')).game?.phase)
      .toBe('playing');
    expect(
      Object.values((await view(host.page, '/api/duel')).game.hands).map(
        (h) => h.length,
      ),
    ).toEqual([15, 15]);
    await button(host.page, '中断本局').click();
    for (const c of r.clients)
      await expect(
        c.page.getByRole('heading', { name: '本局已中断', exact: true }),
      ).toBeVisible();
    expect(r.errors).toEqual([]);
  } finally {
    await r.close();
  }
});

test('late join waits, a closed client interrupts, and all three can start the next game', async ({
  browser,
  baseURL,
}) => {
  const r = await room(browser, baseURL, 2),
    [host, guest] = r.clients;
  let late;
  try {
    await ready(r.clients, 'multiplayer');
    await multiplayer(r.clients);
    const first = (await view(host.page, '/api/multiplayer')).game;
    late = await room(browser, baseURL, 1, {
      code: host.code,
      nicknameOffset: 2,
    });
    const newcomer = late.clients[0],
      all = [...r.clients, newcomer];
    await expect(button(newcomer.page, '等待下一局')).toBeDisabled();
    const joined = await view(host.page, '/api/multiplayer');
    expect(joined.game.gameSessionId).toBe(first.gameSessionId);
    expect(joined.playerIds).toEqual([host.id, guest.id]);
    expect(Object.keys(joined.game.scores)).not.toContain(newcomer.id);
    await button(newcomer.page, '03 听歌抢牌').click();
    await expect(
      newcomer.page.locator('button.song-card').first(),
    ).toBeDisabled();
    await guest.page.close();
    for (const c of [host, newcomer])
      await expect(
        c.page.getByRole('heading', { name: '本局已中断', exact: true }),
      ).toBeVisible();
    const aborted = (await view(host.page, '/api/multiplayer')).game;
    expect(aborted.phase).toBe('aborted');
    for (const c of [host, newcomer])
      await expect(
        c.page.getByText('本局不计正式排名，也不会更新识曲反馈。', {
          exact: true,
        }),
      ).toBeVisible();
    guest.page = await guest.context.newPage();
    guest.page.on('pageerror', (e) => r.errors.push(e.message));
    await guest.page.goto(baseURL);
    await expect(button(guest.page, '修改音乐偏好')).toBeVisible();
    expect((await view(guest.page, '/api/session')).playerId).toBe(guest.id);
    await button(guest.page, '03 听歌抢牌').click();
    await expect(
      guest.page.getByRole('heading', { name: '本局已中断', exact: true }),
    ).toBeVisible();
    for (const c of all)
      expect((await profile(c)).profile.profileVersion).toBe(1);
    await button(host.page, '再来一局').click();
    await expect
      .poll(async () => (await view(host.page, '/api/multiplayer')).phase)
      .toBe('idle');
    expect(
      (await view(host.page, '/api/session')).room.members.every(
        (m) => !m.waitingForNextMatch && !m.lobbyReady,
      ),
    ).toBe(true);
    await lobby(all);
    await ready(all, 'multiplayer');
    await multiplayer(all);
    const restarted = await view(host.page, '/api/multiplayer');
    expect(restarted.game.gameSessionId).not.toBe(first.gameSessionId);
    expect(new Set(restarted.playerIds)).toEqual(new Set(all.map((c) => c.id)));
    const result = await play(host, host, '/api/multiplayer');
    expect(result.game.scores[host.id]).toBe(12);
    expect(result.game.standings).toHaveLength(3);
    for (const c of all) {
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
    expect([...r.errors, ...late.errors]).toEqual([]);
  } finally {
    await late?.close();
    await r.close();
  }
});
