import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import {
  PlayerIdSchema,
  LobbyEntrySchema,
  LobbyCommandSchema,
  type Catalog,
  type PlayerId,
} from '@amp/core';
import { ManualPreferenceSource } from '@amp/adapters';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import { createLobby, type LobbyController } from '@amp/party-runtime';
import { type MaterialPreview } from './materials.js';

export interface ServerOptions {
  catalog: Catalog;
  verifiedQuestionIds?: readonly string[];
  materials?: readonly MaterialPreview[];
  mediaFiles?: ReadonlyMap<string, string>;
  webDirectory?: string;
  now?: () => number;
}
export function createApp(options: ServerOptions) {
  const now = options.now ?? Date.now;
  const rooms = new Map<string, { lobby: LobbyController; touched: number }>();
  type Session = {
    roomId: string;
    playerId: PlayerId;
    expires: number;
    lastSeen: number;
    streams: Set<ServerResponse>;
  };
  const sessions = new Map<string, Session>();
  const id = () => randomBytes(24).toString('hex');
  function send(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(body));
  }
  function authenticate(req: IncomingMessage): Session {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('amp_session='))
      ?.slice(12);
    const session = token ? sessions.get(token) : undefined;
    if (!session || session.expires < now() || !rooms.has(session.roomId))
      throw new Error('请重新加入房间');
    return session;
  }
  function broadcast(roomId: string) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const s of sessions.values())
      if (s.roomId === roomId)
        for (const stream of s.streams)
          stream.write(
            'data: ' + JSON.stringify(room.lobby.snapshot()) + '\n\n',
          );
  }
  async function body(req: IncomingMessage): Promise<unknown> {
    if (!req.headers['content-type']?.startsWith('application/json'))
      throw new Error('需要 JSON 请求');
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      const data: Buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      size += data.length;
      if (size > 65536) throw new Error('请求过大');
      chunks.push(data);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  }
  function establish(res: ServerResponse, roomId: string, playerId: PlayerId) {
    const token = id();
    sessions.set(token, {
      roomId,
      playerId,
      expires: now() + 6 * 60 * 60 * 1000,
      lastSeen: now(),
      streams: new Set(),
    });
    res.setHeader(
      'Set-Cookie',
      'amp_session=' +
        token +
        '; HttpOnly; SameSite=Strict; Path=/; Max-Age=21600',
    );
    send(res, 201, { playerId, room: rooms.get(roomId)!.lobby.snapshot() });
  }
  async function route(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    if (
      req.headers.origin &&
      req.headers.origin !== 'http://' + req.headers.host &&
      req.headers.origin !== 'https://' + req.headers.host
    )
      return send(res, 403, { error: '不接受跨站请求' });
    if (req.method === 'GET' && path === '/api/health')
      return send(res, 200, { status: 'ok', mode: 'D1-preparation' });
    if (req.method === 'GET' && path === '/api/catalog')
      return send(res, 200, {
        songs: options.catalog.songs,
        tags: options.catalog.taxonomy.filter((t) => t.id !== 'lang:unknown'),
        artists: options.catalog.artists,
      });
    if (
      req.method === 'POST' &&
      (path === '/api/rooms' || /^\/api\/rooms\/[A-F0-9]{6}\/join$/.test(path))
    ) {
      // Avoid silently stranding an existing member by replacing its session cookie.
      try {
        authenticate(req);
        return send(res, 409, { error: '请先离开当前房间' });
      } catch {
        /* New or expired browser session. */
      }
      if (sessions.size >= 500)
        return send(res, 503, { error: '演示服务已满' });
      const { nickname } = LobbyEntrySchema.parse(await body(req));
      const playerId = PlayerIdSchema.parse('player:' + id());
      if (path === '/api/rooms') {
        if (rooms.size >= 100) return send(res, 503, { error: '演示房间已满' });
        let roomId: string;
        do {
          roomId = randomBytes(3).toString('hex').toUpperCase();
        } while (rooms.has(roomId));
        const source = new ManualPreferenceSource();
        const lobby = createLobby(roomId, playerId, nickname, {
          catalog: options.catalog,
          verifiedQuestionIds: options.verifiedQuestionIds ?? [],
          now: () => new Date(now()).toISOString(),
          submitProfile: (p, input, catalog, at) =>
            source.submit(
              p,
              input,
              catalog,
              MANUAL_SCORING_CONFIG,
              at,
              'snapshot:' + id(),
            ),
        });
        rooms.set(roomId, { lobby, touched: now() });
        establish(res, roomId, playerId);
        return;
      }
      const roomId = path.split('/')[3]!;
      const room = rooms.get(roomId);
      if (
        !room ||
        !room.lobby
          .snapshot()
          .members.find((m) => m.id === room.lobby.snapshot().hostId)?.online
      )
        return send(res, 404, { error: '房间不存在或房主已离开' });
      room.lobby.join(playerId, nickname);
      room.touched = now();
      establish(res, roomId, playerId);
      broadcast(roomId);
      return;
    }
    if (req.method === 'GET' && path === '/api/session') {
      try {
        const s = authenticate(req);
        return send(res, 200, {
          playerId: s.playerId,
          room: rooms.get(s.roomId)!.lobby.snapshot(),
        });
      } catch {
        return send(res, 200, null);
      }
    }
    if (path.startsWith('/api/')) {
      let session: Session;
      try {
        session = authenticate(req);
      } catch {
        return send(res, 401, { error: '请重新加入房间' });
      }
      const room = rooms.get(session.roomId)!;
      session.lastSeen = now();
      room.touched = now();
      if (req.method === 'GET' && path === '/api/state')
        return send(res, 200, {
          playerId: session.playerId,
          room: room.lobby.snapshot(),
        });
      if (req.method === 'GET' && path === '/api/profile')
        return send(res, 200, room.lobby.self(session.playerId));
      if (req.method === 'GET' && path === '/api/events') {
        room.lobby.setOnline(session.playerId, true);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
        });
        session.streams.add(res);
        broadcast(session.roomId);
        res.on('close', () => {
          session.streams.delete(res);
          if (!session.streams.size) {
            session.lastSeen = now() - 16000;
            try {
              room.lobby.setOnline(session.playerId, false);
              broadcast(session.roomId);
            } catch {
              /* Already left. */
            }
          }
        });
        return;
      }
      if (req.method === 'POST' && path === '/api/commands') {
        const cmd = LobbyCommandSchema.parse(await body(req));
        const state = room.lobby.dispatch(session.playerId, cmd);
        if (cmd.type === 'leave') {
          const leaving = [...sessions].filter(
            ([, s]) =>
              s === session ||
              (s.roomId === session.roomId &&
                session.playerId === state.hostId),
          );
          for (const [token, s] of leaving) {
            sessions.delete(token);
            for (const stream of s.streams) {
              stream.write('event: ended\ndata: {}\n\n');
              stream.end();
            }
          }
          if (session.playerId === state.hostId) rooms.delete(session.roomId);
          res.setHeader(
            'Set-Cookie',
            'amp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
          );
        }
        broadcast(session.roomId);
        return send(res, 200, state);
      }
      if (session.playerId !== room.lobby.snapshot().hostId)
        return send(res, 403, { error: '仅房主可核验素材' });
      if (req.method === 'GET' && path === '/api/materials')
        return send(res, 200, options.materials ?? []);
      const media = /^\/api\/materials\/([A-Za-z0-9-]+)\/audio$/.exec(path);
      if (req.method === 'GET' && media) {
        const file = options.mediaFiles?.get(media[1]!);
        if (!file)
          return send(res, 404, { error: '本地试听文件未安装或校验失败' });
        const size = (await stat(file)).size;
        const range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          const start = match ? Number(match[1]) : -1;
          const end = match?.[2] ? Number(match[2]) : size - 1;
          if (start < 0 || start >= size || end < start || end >= size) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + size });
            res.end();
            return;
          }
          res.writeHead(206, {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'bytes',
            'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
            'Content-Length': end - start + 1,
          });
          createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Content-Length': size,
        });
        createReadStream(file).pipe(res);
        return;
      }
      return send(res, 404, { error: '接口不存在' });
    }
    if (req.method === 'GET' && options.webDirectory) {
      const root = resolve(options.webDirectory);
      const file =
        path === '/'
          ? resolve(root, 'index.html')
          : resolve(root, '.' + decodeURIComponent(path));
      if (!file.startsWith(root + sep))
        return send(res, 404, { error: '页面不存在' });
      try {
        const data = await readFile(file);
        const mime: Record<string, string> = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
        };
        res.writeHead(200, {
          'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Content-Security-Policy':
            "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'self'",
        });
        res.end(data);
        return;
      } catch {
        return send(res, 404, { error: '页面不存在' });
      }
    }
    send(res, 404, { error: '页面不存在' });
  }
  const server = createServer((req, res) => {
    void route(req, res).catch((error) => {
      if (!res.headersSent)
        send(res, 400, {
          error:
            error instanceof Error && !('issues' in error)
              ? error.message
              : '请求字段无效',
        });
      else res.end();
    });
  });
  const timer = setInterval(() => {
    for (const [token, s] of sessions) {
      if (s.expires < now()) {
        sessions.delete(token);
        for (const stream of s.streams) stream.end();
        try {
          rooms.get(s.roomId)?.lobby.setOnline(s.playerId, false);
          broadcast(s.roomId);
        } catch {
          /* Left. */
        }
        continue;
      }
      for (const stream of s.streams) stream.write(': heartbeat\n\n');
      if (!s.streams.size && now() - s.lastSeen > 15000) {
        try {
          rooms.get(s.roomId)?.lobby.setOnline(s.playerId, false);
          broadcast(s.roomId);
        } catch {
          /* Left. */
        }
      }
    }
    for (const [id, r] of rooms)
      if (now() - r.touched > 6 * 60 * 60 * 1000) rooms.delete(id);
  }, 5000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return {
    server,
    close: async () => {
      clearInterval(timer);
      for (const s of sessions.values())
        for (const stream of s.streams) stream.end();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}
