import { createApp } from '@amp/server';
import { testMaterials } from './materials.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import cleanup, { materialDirectory } from './cleanup.mjs';
import process from 'node:process';
const directory = materialDirectory();
await mkdir(directory, { recursive: true });
const { catalog, files } = testMaterials();
const questionAudioFiles = new Map();
for (const [id, content] of files) {
  const path = join(directory, id.replaceAll(':', '-') + '.wav');
  await writeFile(path, content);
  questionAudioFiles.set(id, path);
}
const app = createApp({
  catalog,
  verifiedQuestionIds: [...files.keys()],
  questionAudioFiles,
  webDirectory: resolve('apps/web/dist'),
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await cleanup();
}
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    void stop().then(() => process.exit(0));
  });
app.server.once('error', (error) => {
  process.stderr.write(String(error));
  void stop().then(() => process.exit(1));
});
app.server.listen(3299, '127.0.0.1');
