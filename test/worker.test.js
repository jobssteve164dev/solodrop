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
    label: 'Share your own preview',
    url: 'https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop'
  });
  assert.match(renderEmbedScript(), /d\.action/);
  assert.doesNotMatch(renderEmbedScript(), /d\.cta/);
});

test('redirect preserves target query and adds an opaque link marker', async () => {
  const { withLinkMarker } = await internals();
  assert.equal(withLinkMarker('https://artifact.example.workers.dev/?view=1', 'Ab3xY7'), 'https://artifact.example.workers.dev/?view=1&sd=Ab3xY7');
});

test('embed script fails closed without hiding preview content', async () => {
  const { renderEmbedScript } = await internals();
  const script = renderEmbedScript();
  assert.match(script, /data-solodrop-actions/);
  assert.match(script, /\.catch\(function\(\)\{slot\.hidden=true\}\)/);
  assert.doesNotMatch(script, /document\.body\.replace/);
});
