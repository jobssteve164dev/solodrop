const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { describeArtifact, formatBytes, scanArtifact } = require('../out/artifact.js');

test('describes a supported artifact', async () => {
  const file = path.join(os.tmpdir(), `solodrop-artifact-${Date.now()}.md`);
  fs.writeFileSync(file, '# Result');
  const artifact = await describeArtifact(file);
  assert.equal(artifact.name, path.basename(file));
  assert.equal(artifact.kind, 'Markdown');
  fs.unlinkSync(file);
});

test('formats byte counts for the sidebar', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1.5 KB');
  assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
});

test('detects likely credentials before public sharing', async () => {
  const file = path.join(os.tmpdir(), `solodrop-secret-${Date.now()}.txt`);
  fs.writeFileSync(file, 'api_key=abcdefghijklmnopqrstuvwxyz123456');
  assert.deepEqual(await scanArtifact(file), ['credential assignment']);
  fs.unlinkSync(file);
});
