import process from 'node:process';
import console from 'node:console';
import { fileURLToPath } from 'node:url';
import { loadPendingMaterials } from './materials.js';
import { createApp } from './server.js';

const material = await loadPendingMaterials(
  fileURLToPath(
    new URL('../../../docs/evidence/d0-pjsk-materials.json', import.meta.url),
  ),
  process.env.AMP_MATERIAL_DIR,
);
const app = createApp({
  catalog: material.catalog,
  materials: material.previews,
  mediaFiles: material.files,
  webDirectory: fileURLToPath(new URL('../../web/dist/', import.meta.url)),
});
const port = Number(process.env.PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid PORT');
const host = process.env.HOST ?? '127.0.0.1';
app.server.listen(port, host, () =>
  console.log('Music Party: http://' + host + ':' + port),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });
