import { test, expect } from '@playwright/test';
import { room, ready, prepareDuel, view } from './helpers.mjs';

for (const lost of ['request', 'response'])
  test(
    'audio readiness survives a lost confirmation ' + lost,
    async ({ browser, baseURL }) => {
      const r = await room(browser, baseURL, 2, { audioProbe: true });
      const [host, guest] = r.clients;
      const confirmations = [];
      try {
        await ready(r.clients);
        await prepareDuel(r.clients, 'quick', { start: false });
        await guest.page.route('**/api/duel/action', async (route) => {
          const action = route.request().postDataJSON();
          if (action.type !== 'audio_loaded') return route.continue();
          confirmations.push(action);
          if (confirmations.length > 1) return route.continue();
          if (lost === 'response') await route.fetch();
          await route.abort('failed');
        });
        await host.page
          .getByRole('button', { name: '开始听歌', exact: true })
          .click();
        await expect
          .poll(async () => (await view(host.page, '/api/duel')).game.phase)
          .toBe('playing');
        await expect.poll(() => confirmations.length).toBe(2);
        expect(confirmations[1]).toEqual(confirmations[0]);
        for (const c of r.clients)
          await expect
            .poll(() => c.page.evaluate(() => globalThis.__audioProbe.starts))
            .toBe(1);
        expect(r.errors).toEqual([]);
      } finally {
        await r.close();
      }
    },
  );

test('a rejected audio confirmation aborts promptly instead of waiting for timeout', async ({
  browser,
  baseURL,
}) => {
  const r = await room(browser, baseURL, 2, { audioProbe: true });
  const [host, guest] = r.clients;
  let rejected = 0;
  try {
    await ready(r.clients);
    await prepareDuel(r.clients, 'quick', { start: false });
    await guest.page.route('**/api/duel/action', async (route) => {
      if (route.request().postDataJSON().type !== 'audio_loaded')
        return route.continue();
      rejected++;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: '确认被拒绝' }),
      });
    });
    await host.page
      .getByRole('button', { name: '开始听歌', exact: true })
      .click();
    await expect
      .poll(async () => (await view(host.page, '/api/duel')).game.phase, {
        timeout: 5000,
      })
      .toBe('aborted');
    expect((await view(host.page, '/api/duel')).game.message).toBe(
      '参赛设备播放失败，本局中断',
    );
    expect(rejected).toBe(1);
    for (const c of r.clients)
      expect(await c.page.evaluate(() => globalThis.__audioProbe.starts)).toBe(
        0,
      );
    expect(r.errors).toEqual([]);
  } finally {
    await r.close();
  }
});

test('repeated confirmation transport failures are bounded and stop the match', async ({
  browser,
  baseURL,
}) => {
  const r = await room(browser, baseURL, 2, { audioProbe: true });
  const [host, guest] = r.clients;
  const confirmations = [];
  try {
    await ready(r.clients);
    await prepareDuel(r.clients, 'quick', { start: false });
    await guest.page.route('**/api/duel/action', async (route) => {
      const action = route.request().postDataJSON();
      if (action.type !== 'audio_loaded') return route.continue();
      confirmations.push(action);
      await route.abort('failed');
    });
    await host.page
      .getByRole('button', { name: '开始听歌', exact: true })
      .click();
    await expect
      .poll(async () => (await view(host.page, '/api/duel')).game.phase, {
        timeout: 5000,
      })
      .toBe('aborted');
    expect(confirmations).toHaveLength(3);
    expect(
      confirmations.every((a) => a.actionId === confirmations[0].actionId),
    ).toBe(true);
    expect((await view(host.page, '/api/duel')).game.message).toBe(
      '参赛设备播放失败，本局中断',
    );
    for (const c of r.clients)
      expect(await c.page.evaluate(() => globalThis.__audioProbe.starts)).toBe(
        0,
      );
  } finally {
    await r.close();
  }
});
