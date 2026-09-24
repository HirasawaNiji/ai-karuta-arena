/* global fetch, document, innerWidth */
import { URL } from 'node:url';
import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { testMaterials } from './materials.mjs';
const { hashTitles } = testMaterials();
export const view = (page, path) =>
  page.evaluate(async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Read failed: ' + path);
    return response.json();
  }, path);
export const responseStatus = (page, path) =>
  page.evaluate(async (path) => (await fetch(path)).status, path);
export async function room(
  browser,
  baseURL,
  count,
  { code, onProfile, beforeEnter, nicknameOffset = 0 } = {},
) {
  const clients = [],
    errors = [];
  try {
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      const client = {
        context,
        page,
        nickname: '测试好友' + (i + nicknameOffset),
        audio: new Map(),
        id: null,
      };
      clients.push(client);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (
          !/\/api\/(duel|multiplayer|tournament)\/audio\//.test(
            response.url(),
          ) ||
          !response.ok()
        )
          return;
        void response
          .body()
          .then((buffer) => {
            const title = hashTitles.get(
              createHash('sha256').update(buffer).digest('hex'),
            );
            if (!title) throw new Error('Unexpected current audio bytes');
            client.audio.set(
              new URL(response.url()).pathname.split('/').at(-1),
              title,
            );
          })
          .catch((error) => errors.push(error.message));
      });
      await page.goto(baseURL);
      await expect(
        page.getByRole('button', { name: '创建音乐派对 →', exact: true }),
      ).toBeEnabled();
      if (beforeEnter) await beforeEnter(page, i);
      if (i || code)
        await page
          .getByRole('button', { name: '加入好友', exact: true })
          .click();
      await page.getByLabel('派对昵称').fill(client.nickname);
      if (i || code)
        await page.getByLabel('好友房间码').fill(code ?? clients[0].code);
      await page
        .getByRole('button', {
          name: i || code ? '加入好友房间 →' : '创建音乐派对 →',
          exact: true,
        })
        .click();
      if (onProfile) await onProfile(page, i);
      else
        await page
          .getByRole('button', { name: '暂时跳过，保留未知', exact: true })
          .click();
      const session = await view(page, '/api/session');
      client.id = session.playerId;
      client.code = session.room.roomId;
    }
    expect(new Set(clients.map((c) => c.id)).size).toBe(count);
    return {
      clients,
      errors,
      close: async () => {
        await Promise.all(clients.map((c) => c.context.close()));
      },
    };
  } catch (error) {
    await Promise.all(clients.map((c) => c.context.close()));
    throw error;
  }
}
export async function ready(clients, mode = 'duel', preset = 'quick') {
  const host = clients[0].page;
  if (mode === 'multiplayer')
    await host
      .getByRole('button', {
        name: '多人同场抢牌 2–8 人 · 12 题 · 同分并列',
        exact: true,
      })
      .click();
  if (mode === 'tournament')
    await host
      .getByRole('button', {
        name: '好友单淘汰赛 4 / 8 人 · 半决赛到冠军',
        exact: true,
      })
      .click();
  if (preset === 'standard')
    await host
      .getByRole('button', {
        name: '标准局 · 15 对 15 每人选 18 · BAN 3 · 不追加空牌',
        exact: true,
      })
      .click();
  for (const { page } of clients) {
    await page
      .getByRole('button', { name: '我已完成入场，准备好了', exact: true })
      .click();
    await page
      .getByRole('button', { name: '03 听歌抢牌', exact: true })
      .click();
  }
}
export async function confirm(clients, audio, { start = true } = {}) {
  const warning = audio.page.getByRole('button', {
    name: '了解以上差异，继续这一局',
    exact: true,
  });
  await expect(warning).toBeVisible();
  await warning.click();
  for (const client of clients)
    await client.page
      .getByRole('button', {
        name: client === audio ? '歌牌已就绪，启用共享音箱' : '歌牌已就绪',
        exact: true,
      })
      .click();
  if (start)
    await audio.page
      .getByRole('button', { name: '开始听歌', exact: true })
      .click();
}
export async function prepareDuel(pair, preset = 'quick', options = {}) {
  await pair[0].page
    .getByRole('button', { name: '开始选歌', exact: true })
    .click();
  for (const { page } of pair) {
    const cards = page.locator('button.song-card');
    await expect(cards.first()).toBeVisible();
    for (let i = 0; i < (preset === 'quick' ? 12 : 18); i++)
      await cards.nth(i).click();
    await page.getByRole('button', { name: '确认选歌', exact: true }).click();
  }
  for (const { page } of pair) {
    await expect(
      page.getByRole('button', { name: '确认禁歌', exact: true }),
    ).toBeVisible();
    for (let i = 0; i < (preset === 'quick' ? 2 : 3); i++)
      await page.locator('button.song-card').nth(i).click();
    await page.getByRole('button', { name: '确认禁歌', exact: true }).click();
  }
  await confirm(pair, pair[0], options);
}
export async function play(audio, winner, path) {
  const clicked = new Set();
  let transfers = 0;
  const deadline = Date.now() + 160_000;
  while (Date.now() < deadline) {
    const state = await view(winner.page, path);
    const game = state.preparation?.game ?? state.game;
    if (game?.phase === 'completed')
      return { game, transfers, answered: clicked.size };
    if (game?.phase === 'aborted')
      throw new Error('Unexpected interruption: ' + game.message);
    if (game?.phase === 'transfer' && game.transfer.giverId === winner.id) {
      const own = winner.page
        .getByRole('heading', { name: '你的歌牌', exact: true })
        .locator('..')
        .getByRole('button')
        .first();
      await own.click();
      transfers++;
    } else if (game?.phase === 'playing' && !clicked.has(game.round.token)) {
      const token = game.round.token;
      await expect.poll(() => audio.audio.get(token)).toBeTruthy();
      await winner.page
        .getByRole('button', { name: audio.audio.get(token), exact: true })
        .click();
      clicked.add(token);
    }
    await delay(100);
  }
  throw new Error('Real-clock browser match did not finish');
}
export async function assertNoOverflow(page) {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
}
