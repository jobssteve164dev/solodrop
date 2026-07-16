const assert = require('node:assert/strict');
const test = require('node:test');

const { parseDeploymentOutput, verifyPreview } = require('../out/deployment.js');
const { createDeploymentName } = require('../out/naming.js');

test('separates public and claim URLs', () => {
  const result = parseDeploymentOutput(`Deployed\nhttps://artifact.example.workers.dev\nClaim URL: https://dash.cloudflare.com/claim-preview?claimToken=secret`, true);
  assert.equal(result.previewUrl, 'https://artifact.example.workers.dev');
  assert.equal(result.claimUrl, 'https://dash.cloudflare.com/claim-preview?claimToken=secret');
  assert.equal(result.temporary, true);
});

test('creates valid bounded Worker names', () => {
  const name = createDeploymentName('Quarterly Report (Final).pdf', 1700000000000);
  assert.match(name, /^solodrop-quarterly-report-final-[a-z0-9]+$/);
  assert.ok(name.length < 64);
});

test('waits through an initial Cloudflare route 404', async () => {
  const statuses = [404, 200];
  let pauses = 0;
  await verifyPreview('https://example.workers.dev', async () => new Response('', { status: statuses.shift() }), async () => { pauses += 1; }, 3);
  assert.equal(pauses, 1);
});
