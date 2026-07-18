const assert = require('node:assert/strict');
const test = require('node:test');

const { createManagedLink, getManagedLinkStats, verifyManagedLink } = require('../out/linkService.js');

test('accepts a valid managed short-link response', async () => {
  const result = await createManagedLink({ url: 'https://artifact.example.workers.dev', title: 'Report', temporary: false }, async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { url: 'https://artifact.example.workers.dev', title: 'Report', temporary: false });
    return new Response(JSON.stringify({ shortUrl: 'https://drop.szlk.ai/Ab3xY7z', slug: 'Ab3xY7z', managementToken: 'token' }), { status: 201, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(result.shortUrl, 'https://drop.szlk.ai/Ab3xY7z');
  assert.equal(result.managementToken, 'token');
});

test('rejects a short-link response on another origin', async () => {
  await assert.rejects(() => createManagedLink({ url: 'https://artifact.example.workers.dev', title: 'Report', temporary: false }, async () => new Response(JSON.stringify({ shortUrl: 'https://evil.example/Ab3xY7z', slug: 'Ab3xY7z', managementToken: 'token' }), { status: 201, headers: { 'content-type': 'application/json' } })), /invalid URL/);
});

test('verifies redirect target and reads private click stats', async () => {
  await verifyManagedLink('https://drop.szlk.ai/Ab3xY7z', 'https://artifact.example.workers.dev/', async () => new Response(null, { status: 302, headers: { location: 'https://artifact.example.workers.dev/?sd=Ab3xY7z' } }));
  const clicks = await getManagedLinkStats('https://drop.szlk.ai/Ab3xY7z', 'secret', async (_url, options) => {
    assert.equal(options.headers.authorization, 'Bearer secret');
    return new Response(JSON.stringify({ clicks: 7 }), { headers: { 'content-type': 'application/json' } });
  });
  assert.equal(clicks, 7);
});
