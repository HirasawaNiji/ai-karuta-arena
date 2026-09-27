import process from 'node:process';

process.env.AMP_PRACTICE = '1';
process.env.PORT ??= '3224';
process.env.HOST ??= '127.0.0.1';
await import('../apps/server/dist/main.js');
