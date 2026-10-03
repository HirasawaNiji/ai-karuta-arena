import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  ready,
  prepareDuel,
  confirm,
  play,
  view,
  responseStatus,
  assertNoOverflow,
} from '../tests/browser/helpers.mjs';

const base = process.env.AMP_PUBLIC_URL;
if (!base || !process.env.AMP_AUDIO_INDEX)
  throw new Error('Set AMP_PUBLIC_URL and AMP_AUDIO_INDEX');
const audioIndex = JSON.parse(
  await readFile(process.env.AMP_AUDIO_INDEX, 'utf8'),
);
const titles = new Map(audioIndex.map((r) => [r.sha256, r.title]));
const playedTitles = new Set();
const priorityIds = new Set(
  (process.env.AMP_PRIORITY_SONG_IDS ?? '').split(',').filter(Boolean),
);
const priorityTitles = new Set(
  audioIndex.filter((r) => priorityIds.has(r.id)).map((r) => r.title),
);
const out = 'output/playwright/public-intros';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--mute-audio', '--enable-automation'],
});
const results = [],
  errors = [],
  clients = [];
let responses = 0;
async function enter(count) {
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const client = {
      context,
      page,
      id: null,
      nickname: '公网验证' + i,
      audio: new Map(),
    };
    clients.push(client);
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (response) => {
      if (
        !/\/api\/(duel|multiplayer)\/audio\//.test(response.url()) ||
        !response.ok()
      )
        return;
      void response
        .body()
        .then((buffer) => {
          assert.ok(
            !buffer.subarray(0, 3).equals(Buffer.from('ID3')),
            'Question MP3 has no ID3 answers',
          );
          const title = titles.get(
            createHash('sha256').update(buffer).digest('hex'),
          );
          assert.ok(title, 'Public audio matches an immutable server clip');
          assert.ok(
            buffer.length < 140000,
            'Question audio stays within ten-second bandwidth budget',
          );
          client.audio.set(response.url().split('/').at(-1), title);
          playedTitles.add(title);
          responses++;
        })
        .catch((e) => errors.push(String(e)));
    });
    await page.goto(base);
    if (i)
      await page.getByRole('button', { name: '加入好友', exact: true }).click();
    await page.getByLabel('派对昵称').fill(client.nickname);
    if (i) await page.getByLabel('好友房间码').fill(clients[0].code);
    await page
      .getByRole('button', {
        name: i ? '加入好友房间 →' : '创建音乐派对 →',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: '暂时跳过，保留未知', exact: true })
      .click();
    const session = await view(page, '/api/session');
    client.id = session.playerId;
    client.code = session.room.roomId;
    assert.equal(session.room.playableCount, audioIndex.length);
  }
}
async function leave() {
  const host = clients[0];
  await host.page
    .getByRole('button', { name: '02 好友大厅', exact: true })
    .click();
  await host.page
    .getByRole('button', { name: '结束并离开房间', exact: true })
    .click();
  await expect.poll(() => view(host.page, '/api/session')).toBeNull();
  await Promise.all(clients.splice(0).map((c) => c.context.close()));
}
try {
  const presets = ['quick', 'standard'];
  let supplementalAttempts = 0;
  for (const preset of presets) {
    await enter(2);
    await ready(clients, 'duel', preset);
    if (
      priorityTitles.size &&
      (preset === 'standard' || supplementalAttempts > 0)
    ) {
      const selectCount = preset === 'standard' ? 18 : 12;
      const banCount = preset === 'standard' ? 3 : 2;
      await clients[0].page
        .getByRole('button', { name: '开始选歌', exact: true })
        .click();
      for (const { page } of clients) {
        const cards = page.locator('button.song-card');
        await expect(cards.first()).toBeVisible();
        const names = await cards.allTextContents();
        const chosen = [
          ...names.filter((name) => priorityTitles.has(name)),
          ...names.filter((name) => !priorityTitles.has(name)),
        ].slice(0, selectCount);
        for (const name of chosen)
          await page.getByRole('button', { name, exact: true }).click();
        await page
          .getByRole('button', { name: '确认选歌', exact: true })
          .click();
      }
      for (const { page } of clients) {
        await expect(
          page.getByRole('button', { name: '确认禁歌', exact: true }),
        ).toBeVisible();
        const names = await page.locator('button.song-card').allTextContents();
        for (const name of names
          .filter((name) => !priorityTitles.has(name))
          .slice(0, banCount))
          await page.getByRole('button', { name, exact: true }).click();
        await page
          .getByRole('button', { name: '确认禁歌', exact: true })
          .click();
      }
      await confirm(clients, clients[0]);
    } else await prepareDuel(clients, preset);
    await expect
      .poll(async () => (await view(clients[0].page, '/api/duel')).game?.phase)
      .toBe('playing');
    const opening = (await view(clients[0].page, '/api/duel')).game;
    assert.equal(
      await responseStatus(
        clients[1].page,
        '/api/duel/audio/' + opening.round.token,
      ),
      403,
    );
    assert.ok(opening.round.deadline - Date.now() <= 10100);
    // Let one real round expire: a 30-second stored file must not extend it.
    const token = opening.round.token;
    await delay(11000);
    const after = (await view(clients[0].page, '/api/duel')).game;
    assert.notEqual(
      after.round?.token,
      token,
      'No-answer round advances after ten seconds',
    );
    const result = await play(clients[0], clients[0], '/api/duel');
    assert.equal(result.game.phase, 'completed');
    assert.equal(result.game.winnerId, clients[0].id);
    assert.equal(
      (await view(clients[1].page, '/api/duel')).game.phase,
      'completed',
    );
    await assertNoOverflow(clients[0].page);
    await clients[0].page.screenshot({
      path: out + '/' + preset + '.png',
      fullPage: true,
    });
    results.push({
      mode: preset,
      completed: true,
      answered: result.answered,
      transfers: result.transfers,
      guestAudioDenied: true,
      timeoutAdvances: true,
    });
    console.log(JSON.stringify(results.at(-1)));
    await leave();
    const missing = [...priorityTitles].filter(
      (title) => !playedTitles.has(title),
    );
    if (preset !== 'quick' || supplementalAttempts > 0) {
      console.log(
        JSON.stringify({
          priorityAudioCoverage: priorityTitles.size - missing.length,
          required: priorityTitles.size,
          missing,
        }),
      );
      if (
        process.env.AMP_VERIFY_ALL_PRIORITY === '1' &&
        missing.length &&
        supplementalAttempts++ < 12
      )
        presets.push('quick');
    }
  }
  if (process.env.AMP_VERIFY_ALL_PRIORITY === '1')
    assert.deepEqual(
      [...priorityTitles].filter((title) => !playedTitles.has(title)),
      [],
      'Every supplemental song has a hash-verified public question response',
    );
  await enter(3);
  await ready(clients, 'multiplayer');
  const host = clients[0];
  await host.page
    .getByRole('button', { name: '生成多人题组', exact: true })
    .click();
  for (const c of clients) {
    await c.page.locator('button.song-card').first().click();
    await c.page.getByRole('button', { name: '确认禁歌', exact: true }).click();
  }
  await confirm(clients, host);
  const multi = await play(host, host, '/api/multiplayer');
  assert.equal(multi.game.scores[host.id], 12);
  for (const c of clients)
    assert.deepEqual(
      (await view(c.page, '/api/multiplayer')).game.standings,
      multi.game.standings,
    );
  await host.page.screenshot({
    path: out + '/multiplayer.png',
    fullPage: true,
  });
  results.push({
    mode: 'multiplayer',
    players: 3,
    completed: true,
    questions: 12,
    consistentStandings: true,
  });
  console.log(JSON.stringify(results.at(-1)));
  await leave();
  assert.deepEqual(errors, []);
  await writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        muted: true,
        realMaterials: titles.size,
        audioResponses: responses,
        playedTitles: [...playedTitles],
        priorityPlayedTitles: [...playedTitles].filter((title) =>
          priorityTitles.has(title),
        ),
        results,
        errors,
      },
      null,
      2,
    ) + '\n',
  );
} catch (e) {
  await clients[0]?.page
    .screenshot({ path: out + '/failure.png', fullPage: true })
    .catch(() => {});
  await writeFile(
    out + '/failure.json',
    JSON.stringify(
      {
        error: String(e),
        playedTitles: [...playedTitles],
        missingPriorityTitles: [...priorityTitles].filter(
          (title) => !playedTitles.has(title),
        ),
        results,
        errors,
        view: await view(clients[0]?.page, '/api/duel').catch(() => null),
      },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await Promise.all(clients.map((c) => c.context.close()));
  await browser.close();
}
