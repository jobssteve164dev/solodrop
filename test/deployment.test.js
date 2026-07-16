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
  let pauses = 0;
  await verifyPreview('https://example.workers.dev', async () => new Response('', { status: statuses.shift() }), async () => { pauses += 1; }, 3);
  assert.equal(pauses, 1);
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
