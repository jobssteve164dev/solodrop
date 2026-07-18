const assert = require('node:assert/strict');
const test = require('node:test');

async function internals() {
  return (await import('../worker/src/index.mjs')).workerInternals;
}

test('shortener only accepts HTTPS workers.dev previews', async () => {
  const { normalizeTarget } = await internals();
  assert.equal(normalizeTarget('https://artifact.example.workers.dev/'), 'https://artifact.example.workers.dev/');
  assert.throws(() => normalizeTarget('https://example.com/'), /only accept/);
  assert.throws(() => normalizeTarget('http://artifact.example.workers.dev/'), /must use HTTPS/);
});

test('share-page action is owned by SoloDrop', async () => {
  const { PLATFORM_ACTION, renderEmbedScript } = await internals();
  assert.deepEqual(PLATFORM_ACTION, {
    label: 'Share your own file',
    url: 'https://drop.szlk.ai/'
  });
  assert.match(renderEmbedScript(), /d\.action/);
  assert.match(renderEmbedScript(), /Share your own file/);
  assert.match(renderEmbedScript(), /分享你自己的文件/);
  assert.match(renderEmbedScript(), /由 SoloDrop 分享/);
  assert.match(renderEmbedScript(), /download:'下载'/);
  assert.match(renderEmbedScript(), /download:'Download'/);
  assert.match(renderEmbedScript(), /document\.documentElement\.lang=zh\?'zh-CN':'en'/);
  assert.match(renderEmbedScript(), /querySelector\('\.download'\)/);
  assert.match(renderEmbedScript(), /content="web-v1"/);
  assert.match(renderEmbedScript(), /download\.href='\/file'/);
  assert.match(renderEmbedScript(), /navigator\.languages/);
  assert.match(renderEmbedScript(), /\^zh/);
  assert.match(renderEmbedScript(), /https:\/\/drop\.szlk\.ai\//);
  assert.doesNotMatch(renderEmbedScript(), /!s\|\|!slot/);
  assert.doesNotMatch(renderEmbedScript(), /d\.cta/);
});

test('redirect preserves target query and adds an opaque link marker', async () => {
  const { withLinkMarker } = await internals();
  assert.equal(withLinkMarker('https://artifact.example.workers.dev/?view=1', 'Ab3xY7'), 'https://artifact.example.workers.dev/?view=1&sd=Ab3xY7');
});

test('embed script keeps the platform action when managed-link config is unavailable', async () => {
  const { renderEmbedScript } = await internals();
  const script = renderEmbedScript();
  assert.match(script, /data-solodrop-actions/);
  assert.match(script, /render\(\{action:/);
  assert.match(script, /\.catch\(function\(\)\{\}\)/);
  assert.doesNotMatch(script, /slot\.hidden=true/);
  assert.doesNotMatch(script, /document\.body\.replace/);
});
