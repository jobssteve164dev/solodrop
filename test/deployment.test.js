const assert = require('node:assert/strict');
const test = require('node:test');

const { deployPreview, isWranglerAuthenticated, parseDeploymentOutput, verifyPreview } = require('../out/deployment.js');
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
  const requested = [];
  const pauses = [];
  await verifyPreview('https://example.workers.dev', async (url, options) => {
    requested.push({ url: url.toString(), options });
    return new Response('', { status: statuses.shift() });
  }, async (milliseconds) => { pauses.push(milliseconds); }, 3);
  assert.deepEqual(pauses, [1000]);
  assert.deepEqual(requested.map(({ url }) => url), [
    'https://example.workers.dev/?_solodrop_check=1',
    'https://example.workers.dev/?_solodrop_check=2'
  ]);
  assert.equal(requested[0].options.cache, 'no-store');
  assert.equal(requested[0].options.headers['cache-control'], 'no-cache');
});

test('allows slow Cloudflare route propagation before rejecting a published preview', async () => {
  const pauses = [];
  let requests = 0;
  await verifyPreview('https://example.workers.dev/report?lang=en', async () => {
    requests += 1;
    return new Response('', { status: requests < 10 ? 404 : 200 });
  }, async (milliseconds) => { pauses.push(milliseconds); });
  assert.equal(requests, 10);
  assert.deepEqual(pauses, [1000, 2000, 3000, 5000, 8000, 10000, 10000, 10000, 10000]);
});

test('does not treat unauthenticated whoami exit code zero as authentication', async () => {
  const authenticated = await isWranglerAuthenticated(async () => ({
    stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: ''
  }));
  assert.equal(authenticated, false);
});

test('auto mode adds temporary when Wrangler is not authenticated', async () => {
  const calls = [];
  const result = await deployPreview('/tmp/preview', 'solodrop-test', 'auto', async (_command, args) => {
    calls.push(args);
    if (args.includes('whoami')) return { stdout: 'You are not authenticated. Please run `wrangler login`.', stderr: '' };
    return { stdout: 'https://solodrop-test.example.workers.dev\nhttps://dash.cloudflare.com/claim-preview?claimToken=secret', stderr: '' };
  });
  assert.ok(calls[1].includes('--temporary'));
  assert.equal(result.temporary, true);
});

test('auto mode retries as temporary when non-interactive authentication disappears', async () => {
  const calls = [];
  const result = await deployPreview('/tmp/preview', 'solodrop-test', 'auto', async (_command, args) => {
    calls.push(args);
    if (args.includes('whoami')) return { stdout: 'You are logged in with an API Token. Account ID: abc', stderr: '' };
    if (!args.includes('--temporary')) {
      const error = new Error('Command failed');
      error.stderr = 'In a non-interactive environment, it is necessary to set a CLOUDFLARE_API_TOKEN. To continue, rerun this command with `--temporary`.';
      throw error;
    }
    return { stdout: 'https://solodrop-test.example.workers.dev\nhttps://dash.cloudflare.com/claim-preview?claimToken=secret', stderr: '' };
  });
  assert.ok(calls[2].includes('--temporary'));
  assert.equal(result.temporary, true);
});

test('retries transient temporary account provisioning failures with bounded backoff', async () => {
  let deployAttempts = 0;
  const pauses = [];
  const result = await deployPreview('/tmp/preview', 'solodrop-test', 'temporary', async (_command, args) => {
    assert.match(args[1], /^wrangler@\d+\.\d+\.\d+$/);
    deployAttempts += 1;
    if (deployAttempts < 3) {
      const error = new Error('Command failed');
      error.stderr = 'Failed to create a temporary preview account (504 Gateway Timeout).';
      throw error;
    }
    return { stdout: 'https://solodrop-test.example.workers.dev\nhttps://dash.cloudflare.com/claim-preview?claimToken=secret', stderr: '' };
  }, async (milliseconds) => { pauses.push(milliseconds); });
  assert.equal(result.temporary, true);
  assert.equal(deployAttempts, 3);
  assert.deepEqual(pauses, [2000, 5000]);
});

test('retries Wrangler proof-of-work challenge timeouts during temporary provisioning', async () => {
  let deployAttempts = 0;
  const pauses = [];
  const result = await deployPreview('/tmp/preview', 'solodrop-test', 'temporary', async () => {
    deployAttempts += 1;
    if (deployAttempts === 1) {
      const error = new Error('Command failed: npx wrangler deploy --temporary');
      error.stderr = '\u001b[31m✘ \u001b[41;31m[ERROR]\u001b[0m Failed to request a proof-of-work challenge (504 Gateway Timeout).';
      throw error;
    }
    return { stdout: 'https://solodrop-test.example.workers.dev\nhttps://dash.cloudflare.com/claim-preview?claimToken=secret', stderr: '' };
  }, async (milliseconds) => { pauses.push(milliseconds); });
  assert.equal(result.temporary, true);
  assert.equal(deployAttempts, 2);
  assert.deepEqual(pauses, [2000]);
});

test('does not retry deployment errors outside temporary account provisioning', async () => {
  let attempts = 0;
  await assert.rejects(() => deployPreview('/tmp/preview', 'solodrop-test', 'temporary', async () => {
    attempts += 1;
    const error = new Error('Command failed');
    error.stderr = 'Failed to upload Worker script (504 Gateway Timeout).';
    throw error;
  }, async () => {}), /Command failed/);
  assert.equal(attempts, 1);
});

test('turns exhausted temporary account timeouts into an actionable message', async () => {
  await assert.rejects(() => deployPreview('/tmp/preview', 'solodrop-test', 'temporary', async () => {
    const error = new Error('Command failed');
    error.stderr = 'Failed to create a temporary preview account (503 Service Unavailable).';
    throw error;
  }, async () => {}), (error) => error.name === 'TemporaryProvisioningUnavailableError');
});

test('turns exhausted proof-of-work challenge timeouts into an actionable message', async () => {
  let attempts = 0;
  await assert.rejects(() => deployPreview('/tmp/preview', 'solodrop-test', 'temporary', async () => {
    attempts += 1;
    const error = new Error('Command failed');
    error.stderr = 'Failed to request a proof-of-work challenge (504 Gateway Timeout).';
    throw error;
  }, async () => {}), (error) => error.name === 'TemporaryProvisioningUnavailableError');
  assert.equal(attempts, 3);
});
