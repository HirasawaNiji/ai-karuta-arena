/* global fetch, AbortSignal */
import { createServer, get } from 'node:http';
import { createConnection } from 'node:net';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { setTimeout, clearTimeout, setImmediate } from 'node:timers';

function options(args) {
  if (args[0] === '--') args = args.slice(1);
  const result = { mode: 'stable', client: 'fetch', samples: 50 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && ['stable', 'fresh'].includes(args[i + 1]))
      result.mode = args[++i];
    else if (args[i] === '--client' && ['http', 'fetch'].includes(args[i + 1]))
      result.client = args[++i];
    else if (args[i] === '--samples' && /^[1-9][0-9]*$/.test(args[i + 1] ?? ''))
      result.samples = Number(args[++i]);
    else
      throw Error(
        'Use --mode stable|fresh, --client http|fetch and --samples 1..2000',
      );
  }
  if (result.samples > 2000) throw Error('Samples must be in 1..2000');
  return result;
}
async function listener() {
  const stats = { accepted: 0, requests: 0 };
  const sockets = new Set();
  const server = createServer((_req, res) => {
    stats.requests++;
    res.end('loopback-ok');
  });
  server.on('connection', (socket) => {
    stats.accepted++;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  return {
    stats,
    port,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
async function request(target, protocol) {
  const before = { ...target.stats },
    start = performance.now();
  let connected = false,
    responded = false;
  let result;
  try {
    await new Promise((resolve, reject) => {
      if (protocol === 'fetch') {
        connected = null; // fetch does not expose its TCP connect event.
        void fetch('http://127.0.0.1:' + target.port + '/', {
          signal: AbortSignal.timeout(3000),
        })
          .then(async (response) => {
            connected = true;
            responded = true;
            if (
              response.status !== 200 ||
              (await response.text()) !== 'loopback-ok'
            )
              throw Object.assign(Error('Unexpected probe response'), {
                code: 'PROBE_RESPONSE',
              });
          })
          .then(resolve, reject);
      } else if (protocol === 'tcp') {
        const socket = createConnection({
          host: '127.0.0.1',
          port: target.port,
        });
        const timer = setTimeout(
          () =>
            socket.destroy(
              Object.assign(Error('Probe deadline'), { code: 'PROBE_TIMEOUT' }),
            ),
          3000,
        );
        socket.once('connect', () => {
          connected = true;
          socket.end();
          resolve();
        });
        socket.once('error', reject);
        socket.once('close', () => clearTimeout(timer));
      } else {
        const req = get(
          { host: '127.0.0.1', port: target.port, path: '/', agent: false },
          (res) => {
            responded = true;
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => (body += chunk));
            res.once('error', reject);
            res.once('end', () => {
              if (res.statusCode === 200 && body === 'loopback-ok') resolve();
              else
                reject(
                  Object.assign(Error('Unexpected probe response'), {
                    code: 'PROBE_RESPONSE',
                  }),
                );
            });
          },
        );
        const timer = setTimeout(
          () =>
            req.destroy(
              Object.assign(Error('Probe deadline'), { code: 'PROBE_TIMEOUT' }),
            ),
          3000,
        );
        req.once('socket', (socket) =>
          socket.once('connect', () => {
            connected = true;
          }),
        );
        req.once('error', reject);
        req.once('close', () => clearTimeout(timer));
      }
    });
    result = { ok: true };
  } catch (error) {
    result = {
      ok: false,
      code: error.cause?.code ?? error.code ?? 'PROBE_ERROR',
    };
  }
  // Flush pending server callbacks before recording the server-side observation.
  await new Promise((resolve) => setImmediate(resolve));
  return {
    protocol,
    ...result,
    connected,
    responded,
    elapsedMs: Math.round(performance.now() - start),
    acceptedConnections: target.stats.accepted - before.accepted,
    receivedRequests: target.stats.requests - before.requests,
  };
}
async function run(config) {
  const summary = {
    schemaVersion: 1,
    ...config,
    passed: 0,
    firstFailure: null,
  };
  let stable;
  try {
    if (config.mode === 'stable') stable = await listener();
    for (let sample = 1; sample <= config.samples; sample++) {
      const target = stable ?? (await listener());
      try {
        const primary = await request(target, config.client);
        if (!primary.ok) {
          // These are diagnostic controls, never retries that turn a failure green.
          const tcpControl = await request(target, 'tcp');
          const httpControl = await request(target, 'http');
          summary.firstFailure = { sample, primary, tcpControl, httpControl };
          break;
        }
        summary.passed++;
      } finally {
        if (!stable) await target.close();
      }
      if (config.mode === 'stable')
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    await stable?.close();
  }
  return summary;
}
let config;
try {
  config = options(process.argv.slice(2));
} catch (error) {
  process.stderr.write('Invalid arguments: ' + error.message + '\n');
  process.exitCode = 2;
}
if (config) {
  try {
    const result = await run(config);
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.firstFailure ? 1 : 0;
  } catch {
    // Never expose arbitrary OS error text or machine paths in shareable output.
    process.stderr.write(
      'Probe setup or cleanup failed. No successful result produced.\n',
    );
    process.exitCode = 1;
  }
}
