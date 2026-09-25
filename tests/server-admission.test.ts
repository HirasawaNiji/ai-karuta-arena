import { expect, it } from 'vitest';
import { Agent, request as httpRequest, type ClientRequest } from 'node:http';
import { type AddressInfo } from 'node:net';
import { CatalogSchema, type LobbySnapshot } from '@amp/core';
import { createApp } from '@amp/server';
import { catalogInput } from './fixtures/catalog.js';

type Reply = { status: number; cookie: string | undefined; data: unknown };
type Entry = { room: LobbySnapshot };

it.each(['create', 'join'] as const)(
  'enforces the 500-session limit with delayed %s first and allows a freed slot',
  async (first) => {
    const app = createApp({
      catalog: CatalogSchema.parse(catalogInput()),
      now: () => Date.parse('2026-09-25T00:00:00Z'),
    });
    await new Promise<void>((resolve) =>
      app.server.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const agent = new Agent({ keepAlive: true });
    const pending = new Set<ClientRequest>();
    const results: Promise<Reply>[] = [];
    function open(path: string, data?: unknown, cookie = '', slow = false) {
      let req!: ClientRequest;
      const result = new Promise<Reply>((resolve, reject) => {
        req = httpRequest(
          base + path,
          {
            method: data === undefined ? 'GET' : 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie },
            agent: slow ? false : agent,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('error', reject);
            res.on('end', () => {
              try {
                resolve({
                  status: res.statusCode ?? 500,
                  cookie: res.headers['set-cookie']?.[0]?.split(';')[0],
                  data: JSON.parse(Buffer.concat(chunks).toString()) as unknown,
                });
              } catch (error) {
                reject(
                  error instanceof Error
                    ? error
                    : new Error('Invalid response', { cause: error }),
                );
              }
            });
          },
        );
        req.on('error', reject);
        req.on('close', () => pending.delete(req));
        req.setTimeout(10_000, () =>
          req.destroy(new Error('Admission request timed out')),
        );
      });
      pending.add(req);
      results.push(result);
      // Cleanup can abort held requests if an earlier assertion fails.
      void result.catch(() => {});
      const encoded = data === undefined ? '' : JSON.stringify(data);
      if (slow) req.write(encoded.slice(0, 1));
      else req.end(encoded);
      return {
        result,
        finish: () => {
          req.end(encoded.slice(1));
          return result;
        },
      };
    }
    const request = (path: string, data?: unknown, cookie = '') =>
      open(path, data, cookie).result;
    async function delayed(path: string) {
      const accepted = new Promise<void>((resolve) =>
        app.server.once('request', () => resolve()),
      );
      const started = open(path, { nickname: 'Slow entrant' }, '', true);
      await accepted;
      return started;
    }
    try {
      let roomId = '';
      let host = '';
      // Reach the documented service limit through public HTTP only: 62 full
      // rooms and a three-member room, rather than patching internal maps/limits.
      for (let i = 0; i < 499; i++) {
        const created = i % 8 === 0;
        const response = await request(
          created ? '/api/rooms' : `/api/rooms/${roomId}/join`,
          { nickname: `Player ${i}` },
        );
        expect(response.status).toBe(201);
        expect(response.cookie).toMatch(/^amp_session=/);
        roomId = (response.data as Entry).room.roomId;
        if (created) host = response.cookie!;
      }
      const joinPath = `/api/rooms/${roomId}/join`;
      const creating = await delayed('/api/rooms');
      const joining = await delayed(joinPath);
      const waitingForSlot = await delayed(joinPath);
      const last = await request(joinPath, { nickname: 'Last slot' });
      expect(last.status).toBe(201);
      const before = await request('/api/state', undefined, host);
      for (const started of first === 'create'
        ? [creating, joining]
        : [joining, creating]) {
        const response = await started.finish();
        expect(response.status).toBe(503);
        expect(response.data).toEqual({ error: '演示服务已满' });
        expect(response.cookie).toBeUndefined();
        expect((await request('/api/state', undefined, host)).data).toEqual(
          before.data,
        );
      }
      expect(
        (await request('/api/rooms', { nickname: 'No slot' })).status,
      ).toBe(503);
      expect(
        (await request('/api/commands', { type: 'leave' }, last.cookie)).status,
      ).toBe(200);
      const admitted = await waitingForSlot.finish();
      expect(admitted.status).toBe(201);
      expect(admitted.cookie).toMatch(/^amp_session=/);
      expect((admitted.data as Entry).room.members).toHaveLength(4);
      expect((await request(joinPath, { nickname: 'Full again' })).status).toBe(
        503,
      );
      expect((await request('/api/health')).status).toBe(200);
    } finally {
      for (const req of pending) req.destroy();
      agent.destroy();
      await Promise.allSettled(results);
      await app.close();
    }
  },
  30_000,
);
