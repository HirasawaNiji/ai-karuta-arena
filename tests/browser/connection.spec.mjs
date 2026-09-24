import { test, expect } from '@playwright/test';
import { URL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { room, ready, prepareDuel, view } from './helpers.mjs';

test('expired heartbeat recovers on the same stream without restoring old readiness', async ({
  browser,
  baseURL,
}) => {
  const cdp = await browser.newBrowserCDPSession();
  expect((await cdp.send('Browser.getBrowserCommandLine')).arguments).toContain(
    '--mute-audio',
  );
  await cdp.detach();
  const r = await room(browser, baseURL, 2),
    [host, guest] = r.clients;
  let release;
  const restored = new Promise((resolve) => {
    release = resolve;
  });
  let first;
  const held = new Promise((resolve) => {
    first = resolve;
  });
  let firstRequest;
  let heldAt;
  let newStreams = 0;
  guest.page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/events') newStreams++;
  });
  try {
    await ready(r.clients);
    await prepareDuel(r.clients, 'quick', { start: false });
    expect((await view(host.page, '/api/duel')).canStart).toBe(true);
    await guest.page.route('**/api/heartbeat', async (route) => {
      if (!firstRequest) {
        firstRequest = route.request();
        heldAt = Date.now();
        first();
      }
      // Hold only outgoing replies. The stream and server clock remain real.
      await restored;
      await route.continue();
    });
    await held;
    await expect
      .poll(
        async () =>
          (await view(host.page, '/api/state')).room.members.find(
            (m) => m.id === guest.id,
          ).online,
        { timeout: 21_000 },
      )
      .toBe(false);
    const invalid = await view(host.page, '/api/duel');
    expect(invalid.canStart).toBe(false);
    expect(invalid.readyPlayerIds).toEqual([]);
    expect(invalid.acknowledged).toBe(false);
    // Ensure the first reply is beyond the real 15-second challenge lifetime.
    await delay(Math.max(0, heldAt + 16_000 - Date.now()));
    const staleReply = guest.page.waitForResponse(
      (response) => response.request() === firstRequest,
    );
    release();
    expect((await staleReply).status()).toBe(409);
    await expect
      .poll(
        async () =>
          (await view(host.page, '/api/state')).room.members.find(
            (m) => m.id === guest.id,
          ).online,
      )
      .toBe(true);
    expect(newStreams).toBe(0);
    const recovered = await view(host.page, '/api/duel');
    expect(recovered.canStart).toBe(false);
    expect(recovered.readyPlayerIds).toEqual([]);
    expect(recovered.acknowledged).toBe(false);
    expect(
      (await view(host.page, '/api/state')).room.members.every(
        (m) => !m.lobbyReady,
      ),
    ).toBe(true);
    for (const c of r.clients)
      await c.page
        .getByRole('button', { name: '02 好友大厅', exact: true })
        .click();
    await ready(r.clients);
    await prepareDuel(r.clients);
    await expect
      .poll(async () => (await view(host.page, '/api/duel')).game?.phase)
      .toBe('playing');
    await host.page
      .getByRole('button', { name: '中断本局', exact: true })
      .click();
    expect(r.errors).toEqual([]);
  } finally {
    release();
    await r.close();
  }
});
