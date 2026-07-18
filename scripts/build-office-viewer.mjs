import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('worker/assets', { recursive: true });
await build({
  entryPoints: ['worker/src/office-viewer-entry.js'],
  outfile: 'worker/assets/office-viewer.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  sourcemap: false,
  legalComments: 'eof'
});
