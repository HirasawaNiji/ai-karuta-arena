import { afterEach, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { type AddressInfo } from 'node:net';
import { createApp } from '@amp/server';
import { type LobbySnapshot } from '@amp/core';
import { duelCatalog } from './fixtures/duel.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function fixture(
  players = 2,
  reloadTournamentMaterials?: Parameters<
    typeof createApp
  >[0]['reloadTournamentMaterials'],
) {
  let clock = Date.parse('2026-09-25T00:00:00Z');
  const catalog = duelCatalog();
  const app = createApp({
    catalog,
    verifiedQuestionIds: catalog.questions.map((q) => q.questionId),
    now: () => clock,
    ...(reloadTournamentMaterials ? { reloadTournamentMaterials } : {}),
  });
  await new Promise<void>((resolve) =>
    app.server.listen(0, '127.0.0.1', resolve),
  );
  closers.push(app.close);
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const request = (path: string, cookie = '', data?: unknown) =>
    fetch(base + path, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  const created = await request('/api/rooms', '', { nickname: 'Host' });
  expect(created.status).toBe(201);
  const host = created.headers.get('set-cookie')!.split(';')[0]!;
  const { room } = (await created.json()) as { room: LobbySnapshot };
  const cookies = [host];
  for (let i = 1; i < players; i++) {
    const joined = await request(`/api/rooms/${room.roomId}/join`, '', {
      nickname: `Guest ${i}`,
    });
    expect(joined.status).toBe(201);
    cookies.push(joined.headers.get('set-cookie')!.split(';')[0]!);
    await joined.json();
  }
  const state = async () =>
    (await (await request('/api/state', host)).json()) as {
      room: LobbySnapshot;
    };
  async function delayed(path: string, cookie: string, data: unknown) {
    // The server's route listener reaches its body await before this listener fires.
    // No sleep or timing assumption is used to place the intervening command.
    const accepted = new Promise<void>((resolve) => {
      app.server.once('request', () => resolve());
    });
    const result = deferred<Response>();
    const req = httpRequest(
      base + path,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          result.resolve(
            new Response(Buffer.concat(chunks).toString(), {
              status: res.statusCode ?? 500,
            }),
          ),
        );
        res.on('error', result.reject);
      },
    );
    req.on('error', result.reject);
    req.setTimeout(4000, () =>
      req.destroy(new Error('Delayed request timed out')),
    );
    closers.push(async () => {
      req.destroy();
      await result.promise.catch(() => undefined);
    });
    const encoded = JSON.stringify(data);
    req.write(encoded.slice(0, 1));
    await accepted;
    return {
      finish: () => {
        req.end(encoded.slice(1));
        return result.promise;
      },
    };
  }
  return {
    request,
    host,
    cookies,
    roomId: room.roomId,
    state,
    delayed,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

it.each(['duel', 'multiplayer', 'tournament'] as const)(
  'rejects a delayed %s preparation after the lobby changes mode',
  async (mode) => {
    const { request, host, cookies, state, delayed } = await fixture(
      mode === 'tournament' ? 4 : 2,
    );
    expect(
      (await request('/api/commands', host, { type: 'mode', mode })).status,
    ).toBe(200);
    const before = (await (await request(`/api/${mode}`, host)).json()) as {
      version: number;
    };
    const pending = await delayed(
      `/api/${mode}/${mode === 'tournament' ? 'command' : 'prepare'}`,
      host,
      {
        type: mode === 'tournament' ? 'create' : 'begin',
        ...(mode === 'tournament' ? { size: 4 } : {}),
        actionId: 'delayed-mode-command',
        expectedVersion: before.version,
      },
    );
    const nextMode = mode === 'duel' ? 'multiplayer' : 'duel';
    expect(
      (await request('/api/commands', host, { type: 'mode', mode: nextMode }))
        .status,
    ).toBe(200);
    for (const cookie of cookies)
      expect(
        (await request('/api/commands', cookie, { type: 'ready', ready: true }))
          .status,
      ).toBe(200);
    const settled = await state();
    const response = await pending.finish();
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain(
      '模式',
    );
    expect(await state()).toEqual(settled);
    expect(await (await request(`/api/${mode}`, host)).json()).toEqual(before);
  },
);

it('rejects a session that expires while its request body is still arriving', async () => {
  const { request, host, roomId, delayed, advance } = await fixture();
  advance(1000);
  const joined = await request(`/api/rooms/${roomId}/join`, '', {
    nickname: 'Observer',
  });
  const observer = joined.headers.get('set-cookie')!.split(';')[0]!;
  await joined.json();
  const before: unknown = await (await request('/api/state', observer)).json();
  const pending = await delayed('/api/commands', host, {
    type: 'preset',
    preset: 'standard',
  });
  advance(6 * 60 * 60 * 1000 - 999);
  expect(await (await request('/api/session', host)).json()).toBeNull();
  const response = await pending.finish();
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: '请重新加入房间' });
  expect(await (await request('/api/state', observer)).json()).toEqual(before);
});

it.each(['host', 'guest'] as const)(
  'rejects a delayed command after %s leaves',
  async (leaver) => {
    const { request, host, cookies, state, delayed } = await fixture();
    const cookie = leaver === 'host' ? host : cookies[1]!;
    const pending = await delayed('/api/commands', cookie, {
      type: 'ready',
      ready: true,
    });
    expect(
      (await request('/api/commands', cookie, { type: 'leave' })).status,
    ).toBe(200);
    const remaining = leaver === 'guest' ? await state() : null;
    const response = await pending.finish();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: '请重新加入房间' });
    if (remaining) expect(await state()).toEqual(remaining);
    else expect((await request('/api/state', cookies[1])).status).toBe(401);
  },
);

it.each(['duel', 'multiplayer', 'tournament'] as const)(
  'accepts a delayed %s command when its session and mode remain current',
  async (mode) => {
    const { request, host, cookies, delayed } = await fixture(
      mode === 'tournament' ? 4 : 2,
    );
    expect(
      (await request('/api/commands', host, { type: 'mode', mode })).status,
    ).toBe(200);
    for (const cookie of cookies)
      expect(
        (await request('/api/commands', cookie, { type: 'ready', ready: true }))
          .status,
      ).toBe(200);
    const before = (await (await request(`/api/${mode}`, host)).json()) as {
      version: number;
    };
    const pending = await delayed(
      `/api/${mode}/${mode === 'tournament' ? 'command' : 'prepare'}`,
      host,
      {
        type: mode === 'tournament' ? 'create' : 'begin',
        ...(mode === 'tournament' ? { size: 4 } : {}),
        actionId: 'valid-delayed-command',
        expectedVersion: before.version,
      },
    );
    const response = await pending.finish();
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      version: number;
      phase?: string;
      state?: unknown;
    };
    expect(result.version).toBeGreaterThan(before.version);
    if (mode === 'tournament') expect(result.state).toBeTruthy();
    else expect(result.phase).toBe(mode === 'duel' ? 'selecting' : 'banning');
  },
);

it.each(['expiry', 'leave'] as const)(
  'rejects a material refresh after session %s during the asynchronous load',
  async (reason) => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const fresh = duelCatalog(true, 45);
    const { request, host, cookies, roomId, advance } = await fixture(
      4,
      async () => {
        entered.resolve();
        await release.promise;
        return {
          catalog: fresh,
          verifiedQuestionIds: fresh.questions.map((q) => q.questionId),
          questionAudioFiles: new Map(
            fresh.questions.map((q) => [q.questionId, 'test-only.mp3']),
          ),
        };
      },
    );
    closers.push(() => {
      release.resolve();
      return release.promise;
    });
    expect(
      (
        await request('/api/commands', host, {
          type: 'mode',
          mode: 'tournament',
        })
      ).status,
    ).toBe(200);
    for (const cookie of cookies)
      expect(
        (await request('/api/commands', cookie, { type: 'ready', ready: true }))
          .status,
      ).toBe(200);
    const view = async () =>
      (await (await request('/api/tournament', host)).json()) as {
        version: number;
      };
    expect(
      (
        await request('/api/tournament/command', host, {
          type: 'create',
          size: 4,
          actionId: 'create',
          expectedVersion: (await view()).version,
        })
      ).status,
    ).toBe(200);
    advance(1000);
    const joined = await request(`/api/rooms/${roomId}/join`, '', {
      nickname: 'Observer',
    });
    expect(joined.status).toBe(201);
    const observer = joined.headers.get('set-cookie')!.split(';')[0]!;
    await joined.json();
    const before: unknown = await (
      await request('/api/state', observer)
    ).json();
    const pending = request('/api/tournament/command', host, {
      type: 'refresh_pool',
      actionId: 'refresh',
      expectedVersion: (await view()).version,
    });
    await entered.promise;
    if (reason === 'expiry') advance(6 * 60 * 60 * 1000 - 999);
    else
      expect(
        (await request('/api/commands', host, { type: 'leave' })).status,
      ).toBe(200);
    release.resolve();
    const response = await pending;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: '请重新加入房间' });
    if (reason === 'expiry')
      expect(await (await request('/api/state', observer)).json()).toEqual(
        before,
      );
    else expect((await request('/api/state', observer)).status).toBe(401);
    expect((await request('/api/health')).status).toBe(200);
  },
);
