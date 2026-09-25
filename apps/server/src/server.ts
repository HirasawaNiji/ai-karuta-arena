import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve, extname, sep } from 'node:path';
import {
  PlayerIdSchema,
  LobbyEntrySchema,
  LobbyCommandSchema,
  DuelPreparationCommandSchema,
  DuelActionSchema,
  MultiplayerActionSchema,
  MultiplayerPreparationCommandSchema,
  HeartbeatReplySchema,
  TournamentCommandSchema,
  TournamentPrepareSchema,
  type Catalog,
  type PlayerId,
} from '@amp/core';
import {
  KarutaDuelFactory,
  MultiplayerFactory,
  ManualPreferenceSource,
} from '@amp/adapters';
import { MANUAL_SCORING_CONFIG } from '@amp/music-profile';
import {
  createDuelPreparation,
  createMultiplayerPreparation,
  createTournamentPreparation,
  type TournamentPreparationController,
  type MultiplayerPreparationController,
  createLobby,
  type DuelPreparationController,
  type LobbyController,
} from '@amp/party-runtime';
import { type MaterialPreview } from './materials.js';

export interface ServerOptions {
  catalog: Catalog;
  verifiedQuestionIds?: readonly string[];
  materials?: readonly MaterialPreview[];
  mediaFiles?: ReadonlyMap<string, string>;
  questionAudioFiles?: ReadonlyMap<string, string>;
  /** Trusted local loader only; no browser-supplied paths or manifests. */
  reloadTournamentMaterials?: () => Promise<{
    catalog: Catalog;
    verifiedQuestionIds: readonly string[];
    questionAudioFiles: ReadonlyMap<string, string>;
  }>;
  webDirectory?: string;
  now?: () => number;
}
export function createApp(options: ServerOptions) {
  const now = options.now ?? Date.now;
  const rooms = new Map<
    string,
    {
      lobby: LobbyController;
      duel: DuelPreparationController;
      multi: MultiplayerPreparationController;
      tournament: TournamentPreparationController;
      touched: number;
      questionAudioFiles: Map<string, string>;
    }
  >();
  type Session = {
    roomId: string;
    playerId: PlayerId;
    expires: number;
    lastSeen: number;
    streams: Set<ServerResponse>;
    lastPong: number;
    challenge: { token: string; issuedAt: number } | null;
    rttSamples: number[];
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
    if (
      room.lobby.snapshot().mode === 'tournament' &&
      !room.tournament.active()
    )
      room.lobby.releaseWaiting();
    for (const s of sessions.values())
      if (s.roomId === roomId)
        for (const stream of s.streams) {
          if (stream.destroyed || stream.writableEnded) continue;
          stream.write(
            'data: ' +
              JSON.stringify(room.lobby.snapshot()) +
              '\n\nevent: duel\ndata: ' +
              JSON.stringify(room.duel.snapshot(s.playerId)) +
              '\n\nevent: multiplayer\ndata: ' +
              JSON.stringify(room.multi.snapshot(s.playerId)) +
              '\n\nevent: tournament\ndata: ' +
              JSON.stringify(room.tournament.snapshot(s.playerId)) +
              '\n\n',
          );
        }
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
      lastPong: now(),
      challenge: null,
      rttSamples: [],
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
      return send(res, 200, { status: 'ok', mode: 'D4-tournament' });
    if (req.method === 'GET' && path === '/api/catalog') {
      let catalog = options.catalog;
      let playableSongIds = catalog.questions
        .filter((q) => options.verifiedQuestionIds?.includes(q.questionId))
        .map((q) => q.songId);
      try {
        const context = rooms
          .get(authenticate(req).roomId)!
          .lobby.preparationContext();
        catalog = context.catalog;
        playableSongIds = Object.values(context.questions).map((q) => q.songId);
      } catch {
        /* Public entry catalog. */
      }
      return send(res, 200, {
        songs: catalog.songs,
        playableSongIds,
        tags: catalog.taxonomy.filter((t) => t.id !== 'lang:unknown'),
        artists: catalog.artists,
      });
    }
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
        const duel = createDuelPreparation({
          context: lobby.preparationContext,
          factory: new KarutaDuelFactory(),
          now,
          nextId: id,
          seed: () => randomBytes(4).readUInt32LE(),
          onChange: () => broadcast(roomId),
          onCompleted: lobby.settleDuel,
        });
        const multi = createMultiplayerPreparation({
          context: lobby.preparationContext,
          factory: new MultiplayerFactory(),
          now,
          nextId: id,
          seed: () => randomBytes(4).readUInt32LE(),
          onChange: () => broadcast(roomId),
          onCompleted: lobby.settleGame,
        });
        const tournament = createTournamentPreparation({
          context: lobby.preparationContext,
          room: lobby.snapshot,
          factory: new KarutaDuelFactory(),
          now,
          nextId: id,
          seed: () => randomBytes(4).readUInt32LE(),
          onChange: () => broadcast(roomId),
          onCompleted: (r, events) => lobby.settleGame(r.game, events, true),
        });
        rooms.set(roomId, {
          lobby,
          duel,
          multi,
          tournament,
          touched: now(),
          questionAudioFiles: new Map(options.questionAudioFiles),
        });
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
      const ongoing = [
        room.duel.snapshot(room.lobby.snapshot().hostId).game,
        room.multi.snapshot(room.lobby.snapshot().hostId).game,
      ].some((g) => g && !['completed', 'aborted'].includes(g.phase));
      room.lobby.join(playerId, nickname, ongoing || room.tournament.active());
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
      const input = req.method === 'POST' ? await body(req) : undefined;
      if (req.method === 'POST') {
        // Reading a streamed body yields: the session may expire or be revoked.
        // Resolve the room and check its mode only after that wait has finished.
        try {
          session = authenticate(req);
        } catch {
          return send(res, 401, { error: '请重新加入房间' });
        }
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
        session.challenge = { token: id(), issuedAt: now() };
        res.write(
          'event: heartbeat\ndata: ' +
            JSON.stringify({ token: session.challenge.token }) +
            '\n\n',
        );
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
        const cmd = LobbyCommandSchema.parse(input);
        const member = room.lobby
          .snapshot()
          .members.find((m) => m.id === session.playerId);
        const ongoing = [
          room.duel.snapshot(session.playerId).game,
          room.multi.snapshot(session.playerId).game,
        ].some((g) => g && !['completed', 'aborted'].includes(g.phase));
        if (
          (ongoing || room.tournament.active()) &&
          cmd.type !== 'leave' &&
          !(member?.waitingForNextMatch && cmd.type === 'profile')
        )
          throw new Error('请先结束当前对局');
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
      if (req.method === 'GET' && path === '/api/tournament')
        return send(res, 200, room.tournament.snapshot(session.playerId));
      if (req.method === 'POST' && path === '/api/tournament/command') {
        if (room.lobby.snapshot().mode !== 'tournament')
          throw new Error('请切换到淘汰赛模式');
        const cmd = TournamentCommandSchema.parse(input);
        if (
          cmd.type === 'refresh_pool' &&
          room.tournament.checkRefresh(session.playerId, cmd)
        ) {
          if (!options.reloadTournamentMaterials)
            throw new Error('管理员尚未配置题库刷新来源');
          const refreshed = await options.reloadTournamentMaterials();
          // Loading is asynchronous: reject stale requests before changing room data.
          try {
            authenticate(req);
          } catch {
            return send(res, 401, { error: '请重新加入房间' });
          }
          if (!room.tournament.checkRefresh(session.playerId, cmd))
            return send(
              res,
              200,
              room.tournament.dispatch(session.playerId, cmd),
            );
          for (const qid of refreshed.verifiedQuestionIds) {
            if (!refreshed.questionAudioFiles.has(qid))
              throw new Error('新增核验片段不可用');
          }
          room.lobby.supplementMaterials(
            refreshed.catalog,
            refreshed.verifiedQuestionIds,
          );
          for (const [qid, file] of refreshed.questionAudioFiles) {
            if (!room.questionAudioFiles.has(qid))
              room.questionAudioFiles.set(qid, file);
          }
        }
        const result = room.tournament.dispatch(session.playerId, cmd);
        if (!room.tournament.active()) room.lobby.releaseWaiting();
        broadcast(session.roomId);
        return send(res, 200, result);
      }
      if (req.method === 'POST' && path === '/api/tournament/prepare') {
        const envelope = TournamentPrepareSchema.parse(input);
        const cmd = envelope.command;
        const pair =
          room.tournament
            .snapshot(session.playerId)
            .matchRoom?.members.map((m) => m.id) ?? [];
        if (
          cmd.type === 'start' &&
          pair.some(
            (id) =>
              ![...sessions.values()].some(
                (s) =>
                  s.roomId === session.roomId &&
                  s.playerId === id &&
                  now() - s.lastPong <= 15000 &&
                  s.rttSamples.length > 0,
              ),
          )
        )
          throw new Error('等待本场双方连接确认');
        return send(
          res,
          200,
          room.tournament.prepare(session.playerId, cmd, envelope),
        );
      }
      if (req.method === 'POST' && path === '/api/tournament/action') {
        const samples = [...session.rttSamples].sort((a, b) => a - b);
        return send(
          res,
          200,
          room.tournament.action(
            session.playerId,
            DuelActionSchema.parse(input),
            samples[Math.floor(samples.length / 2)] ?? 0,
          ),
        );
      }
      const tournamentAudio =
        /^\/api\/tournament\/audio\/([A-Za-z0-9:-]+)$/.exec(path);
      if (req.method === 'GET' && tournamentAudio) {
        room.tournament.tick();
        const q = room.tournament.currentQuestion(
          session.playerId,
          tournamentAudio[1]!,
        );
        const file = q ? room.questionAudioFiles.get(q.questionId) : undefined;
        if (!file) return send(res, 404, { error: '当前片段不可用' });
        return audio(req, res, file);
      }
      if (req.method === 'GET' && path === '/api/duel')
        return send(res, 200, room.duel.snapshot(session.playerId));
      if (req.method === 'POST' && path === '/api/heartbeat') {
        const reply = HeartbeatReplySchema.parse(input);
        const challenge = session.challenge;
        if (
          !challenge ||
          challenge.token !== reply.token ||
          now() - challenge.issuedAt > 15000
        )
          return send(res, 409, { error: '心跳已过期' });
        session.rttSamples = [
          ...session.rttSamples,
          now() - challenge.issuedAt,
        ].slice(-5);
        session.challenge = null;
        session.lastPong = now();
        room.lobby.setOnline(session.playerId, reply.visible);
        room.duel.tick();
        room.multi.tick();
        room.tournament.tick();
        broadcast(session.roomId);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/duel/prepare') {
        if (room.lobby.snapshot().mode !== 'duel')
          throw new Error('请切换到双人模式');
        const cmd = DuelPreparationCommandSchema.parse(input);
        if (
          cmd.type === 'start' &&
          [...sessions.values()]
            .filter((s) => s.roomId === session.roomId)
            .some((s) => now() - s.lastPong > 15000 || s.rttSamples.length < 1)
        )
          throw new Error('等待双方连接确认后再开局');
        const result = room.duel.dispatch(session.playerId, cmd);
        if (cmd.type === 'reset') {
          room.lobby.releaseWaiting();
          broadcast(session.roomId);
        }
        return send(res, 200, result);
      }
      if (req.method === 'POST' && path === '/api/duel/action') {
        const cmd = DuelActionSchema.parse(input);
        const samples = [...session.rttSamples].sort((a, b) => a - b);
        return send(
          res,
          200,
          room.duel.action(
            session.playerId,
            cmd,
            samples[Math.floor(samples.length / 2)] ?? 0,
          ),
        );
      }
      if (req.method === 'GET' && path === '/api/multiplayer')
        return send(res, 200, room.multi.snapshot(session.playerId));
      if (req.method === 'POST' && path === '/api/multiplayer/prepare') {
        if (room.lobby.snapshot().mode !== 'multiplayer')
          throw new Error('请切换到多人模式');
        const cmd = MultiplayerPreparationCommandSchema.parse(input);
        if (
          cmd.type === 'start' &&
          [...sessions.values()]
            .filter(
              (s) =>
                s.roomId === session.roomId &&
                room.multi
                  .snapshot(session.playerId)
                  .playerIds.includes(s.playerId),
            )
            .some((s) => now() - s.lastPong > 15000 || s.rttSamples.length < 1)
        )
          throw new Error('等待全员连接确认');
        const result = room.multi.dispatch(session.playerId, cmd);
        if (cmd.type === 'reset') {
          room.lobby.releaseWaiting();
          broadcast(session.roomId);
        }
        return send(res, 200, result);
      }
      if (req.method === 'POST' && path === '/api/multiplayer/action')
        return send(
          res,
          200,
          room.multi.action(
            session.playerId,
            MultiplayerActionSchema.parse(input),
          ),
        );
      const multiAudio = /^\/api\/multiplayer\/audio\/([A-Za-z0-9:-]+)$/.exec(
        path,
      );
      if (req.method === 'GET' && multiAudio) {
        if (session.playerId !== room.lobby.snapshot().hostId)
          return send(res, 403, { error: '音频仅由共享音箱播放' });
        room.multi.tick();
        room.tournament.tick();
        const q = room.multi.currentQuestion(multiAudio[1]!);
        const file = q
          ? options.questionAudioFiles?.get(q.questionId)
          : undefined;
        if (!file) return send(res, 404, { error: '当前片段不可用' });
        return audio(req, res, file);
      }
      const roundAudio = new RegExp('^/api/duel/audio/([A-Za-z0-9:-]+)$').exec(
        path,
      );
      if (req.method === 'GET' && roundAudio) {
        if (session.playerId !== room.lobby.snapshot().hostId)
          return send(res, 403, { error: '音频仅由共享音箱播放' });
        room.duel.tick();
        const question = room.duel.currentQuestion(roundAudio[1]!);
        const file = question
          ? options.questionAudioFiles?.get(question.questionId)
          : undefined;
        if (!file) return send(res, 404, { error: '当前片段不可用' });
        return audio(req, res, file);
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
        return audio(req, res, file);
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
  async function audio(
    req: IncomingMessage,
    res: ServerResponse,
    file: string,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || info.size === 0)
      return send(res, 404, { error: '音频文件不可用' });
    const size = info.size;
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
      await pipeline(createReadStream(file, { start, end }), res);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': size,
    });
    await pipeline(createReadStream(file), res);
  }
  const server = createServer((req, res) => {
    void route(req, res).catch((error) => {
      // pipeline has already closed failed or cancelled audio responses.
      if (res.destroyed || res.writableEnded) return;
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
      // An unanswered/expired challenge must not permanently strand a live SSE.
      if (!s.challenge || now() - s.challenge.issuedAt > 15000) {
        s.challenge = { token: id(), issuedAt: now() };
        for (const stream of s.streams)
          stream.write(
            'event: heartbeat\ndata: ' +
              JSON.stringify({ token: s.challenge.token }) +
              '\n\n',
          );
      }
      if (now() - s.lastPong > 15000) {
        try {
          rooms.get(s.roomId)?.lobby.setOnline(s.playerId, false);
          broadcast(s.roomId);
        } catch {
          /* Left. */
        }
      }
    }
    for (const r of rooms.values()) {
      r.duel.tick();
      r.multi.tick();
      r.tournament.tick();
    }
    for (const [id, r] of rooms)
      if (now() - r.touched > 6 * 60 * 60 * 1000) rooms.delete(id);
  }, 5000);
  timer.unref();
  const gameTimer = setInterval(() => {
    for (const r of rooms.values()) {
      r.duel.tick();
      r.multi.tick();
      r.tournament.tick();
    }
  }, 50);
  gameTimer.unref();
  server.on('close', () => {
    clearInterval(timer);
    clearInterval(gameTimer);
  });
  return {
    server,
    close: async () => {
      clearInterval(timer);
      clearInterval(gameTimer);
      for (const s of sessions.values())
        for (const stream of s.streams) stream.end();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    },
  };
}

export { loadPendingMaterials } from './materials.js';
export {
  loadReviewedMaterials,
  type MaterialReview,
} from './reviewed-materials.js';
