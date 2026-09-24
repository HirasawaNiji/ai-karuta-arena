/* global document, Event */
import { test, expect } from '@playwright/test';
import { room, ready, prepareDuel, view } from './helpers.mjs';

test('simulated background event interrupts the active tournament attempt through its own endpoint', async ({
  browser,
  baseURL,
}) => {
  const cdp = await browser.newBrowserCDPSession();
  expect((await cdp.send('Browser.getBrowserCommandLine')).arguments).toContain(
    '--mute-audio',
  );
  await cdp.detach();
  const r = await room(browser, baseURL, 4),
    host = r.clients[0];
  try {
    await ready(r.clients, 'tournament');
    await host.page
      .getByRole('button', { name: '创建 4 人淘汰赛', exact: true })
      .click();
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
    await expect
      .poll(
        async () =>
          (await view(host.page, '/api/tournament')).preparation.game?.phase,
      )
      .toBe('playing');
    const responsePromise = pair[0].page.waitForResponse((response) => {
      if (!/\/api\/(duel|tournament)\/prepare$/.test(response.url()))
        return false;
      const body = response.request().postDataJSON();
      return (body.command ?? body).type === 'interrupt';
    });
    // Simulates the browser lifecycle event, not a claim of physical QQ WebView validation.
    await pair[0].page.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const response = await responsePromise;
    await pair[0].page.evaluate(() => {
      delete document.hidden;
    });
    expect(response.url()).toBe(baseURL + '/api/tournament/prepare');
    expect(response.status()).toBe(200);
    const sent = response.request().postDataJSON();
    expect(sent).toMatchObject({
      matchId: match.matchId,
      attempt: match.attempt,
      command: { type: 'interrupt' },
    });
    await expect
      .poll(
        async () =>
          (await view(host.page, '/api/tournament')).preparation.game?.phase,
      )
      .toBe('aborted');
    const after = await view(host.page, '/api/tournament');
    expect(after.preparation.game.winnerId).toBeNull();
    expect(after.state.matches.filter((m) => m.status === 'completed')).toEqual(
      [],
    );
    for (const c of pair) {
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
