/* global fetch, document, innerWidth */
import process from 'node:process';
import console from 'node:console';
import { chromium, expect } from '@playwright/test';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const base = process.env.AMP_PRACTICE_URL ?? 'http://127.0.0.1:3224';
const cache = process.env.AMP_AUDIO_CACHE ?? '.local/duel-audio';
const out = 'output/playwright/practice-59';
await mkdir(out, { recursive: true });
const review = JSON.parse(
  await readFile(
    process.env.AMP_REVIEWED_MATERIALS ??
      'docs/evidence/pjsk-intro-review.json',
    'utf8',
  ),
);
const titles = new Map();
for (const file of await readdir(cache)) {
  const record = review.records.find((r) =>
    file.startsWith(r.audioSha256 + '-intro-v1-'),
  );
  if (!record || !file.endsWith('.mp3')) continue;
  titles.set(
    createHash('sha256')
      .update(await readFile(cache + '/' + file))
      .digest('hex'),
    record.title,
  );
}
assert.equal(titles.size, review.records.length);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-automation'],
});
const cdp = await browser.newBrowserCDPSession();
assert.ok(
  (await cdp.send('Browser.getBrowserCommandLine')).arguments.includes(
    '--mute-audio',
  ),
);
const results = [];
try {
  for (const preset of ['quick', 'standard']) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const audio = new Map(),
      errors = [],
      started = new Map();
    let audioResponses = 0;
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (response) => {
      if (/\/api\/duel\/audio\//.test(response.url()) && response.ok()) {
        void response
          .body()
          .then((bytes) => {
            const title = titles.get(
              createHash('sha256').update(bytes).digest('hex'),
            );
            assert.ok(title, 'Actual audio must match a reviewed clip');
            audio.set(response.url().split('/').at(-1), title);
            audioResponses++;
          })
          .catch((e) => errors.push(String(e)));
      }
    });
    const view = (path = '/api/duel') =>
      page.evaluate(async (path) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      }, path);
    const click = (name) =>
      page.getByRole('button', { name, exact: true }).click();
    async function prepare() {
      await click('开始选歌');
      const cards = page.locator('button.song-card');
      await expect(cards.first()).toBeVisible();
      for (let i = 0; i < (preset === 'quick' ? 12 : 18); i++)
        await cards.nth(i).click();
      await click('确认选歌');
      await expect(
        page.getByRole('button', { name: '确认禁歌', exact: true }),
      ).toBeVisible();
      for (let i = 0; i < (preset === 'quick' ? 2 : 3); i++)
        await cards.nth(i).click();
      await click('确认禁歌');
      await click('了解以上差异，继续这一局');
      await click('歌牌已就绪，启用共享音箱');
      await expect(
        page.getByRole('button', { name: '开始听歌', exact: true }),
      ).toBeEnabled();
      await click('开始听歌');
    }
    try {
      await page.goto(base);
      await expect(
        page.getByText('单人人机陪练 · 本局不记录画像成绩', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: '加入好友', exact: true }),
      ).toBeHidden();
      await page.screenshot({
        path: out + '/' + preset + '-entry.png',
        fullPage: true,
      });
      await page.getByLabel('派对昵称').fill('人机验收');
      await click('创建音乐派对 →');
      await click('暂时跳过，保留未知');
      const entry = await view('/api/session');
      assert.equal(entry.room.members.length, 2);
      const bot = entry.room.members.find((m) => m.id !== entry.playerId).id;
      await expect(
        page.getByText('电脑陪练（规则）', { exact: true }),
      ).toBeVisible();
      if (preset === 'standard')
        await click('标准局 · 15 对 15 每人选 18 · BAN 3 · 不追加空牌');
      const initialProfile = await view('/api/profile');
      await click('我已完成入场，准备好了');
      await click('03 听歌抢牌');
      await prepare();
      let interruptedSession;
      if (preset === 'quick') {
        await expect
          .poll(async () => (await view()).game.phase)
          .toBe('playing');
        interruptedSession = (await view()).game.gameSessionId;
        await click('中断本局');
        await expect
          .poll(async () => (await view()).game.phase)
          .toBe('aborted');
        await delay(6500);
        assert.deepEqual(await view('/api/profile'), initialProfile);
        await click('再来一局');
        await prepare();
        assert.notEqual((await view()).game.gameSessionId, interruptedSession);
      }
      const claimed = new Set();
      let transfers = 0,
        botObserved = false,
        result;
      const deadline = Date.now() + 220000;
      while (Date.now() < deadline) {
        const state = await view(),
          game = state.game;
        if (game.phase === 'completed') {
          result = game;
          break;
        }
        assert.notEqual(game.phase, 'aborted', game.message);
        if (game.scores[bot] > 0) botObserved = true;
        if (
          game.phase === 'transfer' &&
          game.transfer.giverId === entry.playerId
        ) {
          await page
            .getByRole('heading', { name: '你的歌牌', exact: true })
            .locator('..')
            .getByRole('button')
            .first()
            .click();
          transfers++;
        } else if (game.phase === 'playing') {
          if (!started.has(game.round.token))
            started.set(game.round.token, Date.now());
          // Give the real opponent time to act until it has scored once.
          if (
            botObserved &&
            !claimed.has(game.round.token) &&
            audio.has(game.round.token)
          ) {
            await click(audio.get(game.round.token));
            claimed.add(game.round.token);
          }
        }
        await delay(100);
      }
      assert.ok(result, 'Match completes within real-clock limit');
      assert.ok(botObserved, 'Opponent actually claimed at least one card');
      assert.deepEqual(
        await view('/api/profile'),
        initialProfile,
        'Practice must not write gameplay evidence',
      );
      await expect(
        page.getByText('陪练结果仅供本次体验，不会更新任何玩家的音乐画像。', {
          exact: true,
        }),
      ).toBeVisible();
      for (const width of [360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
      }
      await page.screenshot({
        path: out + '/' + preset + '-result.png',
        fullPage: true,
      });
      await click('02 好友大厅');
      await click('结束并离开房间');
      await expect.poll(() => view('/api/session')).toBeNull();
      assert.deepEqual(errors, []);
      results.push({
        preset,
        status: 'passed',
        rounds: result.round.number,
        winner: result.winnerId === entry.playerId ? 'human' : 'computer',
        botObserved,
        humanClaims: claimed.size,
        transfers,
        audioResponses,
        profileUnchanged: true,
        interruptRestart: preset === 'quick',
        leave: true,
      });
      console.log(JSON.stringify(results.at(-1)));
    } catch (e) {
      await page
        .screenshot({
          path: out + '/' + preset + '-failure.png',
          fullPage: true,
        })
        .catch(() => {});
      await writeFile(
        out + '/failure.json',
        JSON.stringify(
          {
            preset,
            error: String(e),
            view: await view().catch(() => null),
            errors,
          },
          null,
          2,
        ),
      );
      throw e;
    } finally {
      await context.close();
    }
  }
  await writeFile(
    out + '/results.json',
    JSON.stringify(
      { muted: true, realMaterials: titles.size, results },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
