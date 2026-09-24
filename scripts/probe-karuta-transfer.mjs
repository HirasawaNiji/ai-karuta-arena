// Run with: node scripts/probe-karuta-transfer.mjs <engine-root> <package-dir>
// Isolated protocol probe; not a browser or human-listening acceptance test.
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';

const [engineRoot, packageDir] = process.argv.slice(2);
if (!engineRoot || !packageDir) {
  throw new Error('Expected engine-root and isolated package-dir arguments');
}
const { OnlineRoomManager } = await import(
  pathToFileURL(path.resolve(engineRoot, 'server/onlineRooms.mjs')).href
);
class Socket {
  readyState = 1;
  messages = [];
  send(value) {
    this.messages.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
}
const manager = new OnlineRoomManager(path.resolve(packageDir), {
  maxRooms: 1,
});
const sockets = [new Socket(), new Socket()];
const sessions = sockets.map((socket) => manager.connect(socket));
const send = (index, body) =>
  manager.handle(sessions[index], JSON.stringify(body));
const latest = (index) =>
  sockets[index].messages.findLast((message) => message.t === 'room').room;
try {
  await send(0, {
    t: 'createRoom',
    nickname: 'probe-A',
    name: 'D0 transfer probe',
    packageId: 'jla-muca-pjsk-lite.zip',
  });
  await send(1, { t: 'joinRoom', nickname: 'probe-B', code: latest(0).code });
  for (let sample = 0; sample < 3; sample++) {
    sessions.forEach((session) => manager.recordPong(session, 20));
  }
  await send(0, { t: 'ready', ready: true });
  await send(1, { t: 'ready', ready: true });
  for (const index of [0, 1]) {
    await send(index, {
      t: 'selectCards',
      cardKeys: latest(index).draft.poolCardKeys.slice(0, 30),
    });
  }
  for (const index of [0, 1]) {
    await send(index, {
      t: 'banCards',
      cardKeys: latest(index).draft.exchangeCardKeys.slice(0, 5),
    });
  }
  const room = [...manager.rooms.values()][0];
  room.clearTimers();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
  // Target only the post-claim transition with a real catalog and real hands.
  room.phase = 'playing';
  room.nextRound();
  const target = room.seats.B.handCardKeys[0];
  room.current.isEmpty = false;
  room.current.cardKey = target;
  room.current.song = room.cardByKey.get(target).songs[0];
  room.resolveRound('A', 'claimed');
  assert.equal(room.pendingTransfer.to, 'A');
  const round = room.roundNo;
  mock.timers.tick(40001);
  const stuck = Boolean(room.pendingTransfer) && room.roundNo === round;
  console.log(
    JSON.stringify({
      probe: 'opponent-card-transfer-timeout',
      elapsedMs: 40001,
      pendingAfterDeadline: Boolean(room.pendingTransfer),
      roundAdvanced: room.roundNo > round,
      defectReproduced: stuck,
    }),
  );
  // A passing probe confirms the known baseline defect, NOT a healthy engine.
  assert.equal(
    stuck,
    true,
    'Baseline changed: investigate before reusing this audit',
  );
} finally {
  manager.dispose();
  mock.timers.reset();
}
