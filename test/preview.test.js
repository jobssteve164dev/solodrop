const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildPreview, previewInternals } = require('../out/preview.js');

test('escapes user-controlled markup', () => {
  assert.equal(previewInternals.escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

test('parses quoted CSV cells', () => {
  assert.deepEqual(previewInternals.parseCsv('name,note\nSoloDrop,"share, safely"'), [
    ['name', 'note'], ['SoloDrop', 'share, safely']
  ]);
});

test('renders basic markdown without executing HTML', () => {
  const html = previewInternals.renderMarkdown('# Result\n\n<script>alert(1)</script>');
  assert.match(html, /<h1>Result<\/h1>/);
  assert.doesNotMatch(html, /<script>/);
});

test('builds a content-first branded page with a non-blocking managed action slot', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solodrop-preview-test-'));
  const source = path.join(directory, 'report.md');
  const output = path.join(directory, 'output');
  fs.writeFileSync(source, '# Result');
  await buildPreview({ path: source, name: 'report.md', size: 8, kind: 'Markdown' }, output);
  const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
  const headers = fs.readFileSync(path.join(output, '_headers'), 'utf8');
  assert.match(html, /name="solodrop-preview" content="v1"/);
  assert.match(html, /<main class="content" id="content"><h1>Result<\/h1><\/main>/);
  assert.match(html, /data-solodrop-actions hidden/);
  assert.match(html, /https:\/\/drop\.szlk\.ai\/embed\.js/);
  assert.match(headers, /connect-src https:\/\/drop\.szlk\.ai/);
  fs.unlinkSync(path.join(output, 'index.html'));
  fs.unlinkSync(path.join(output, '_headers'));
  fs.unlinkSync(path.join(output, 'report.md'));
  fs.rmdirSync(output);
  fs.unlinkSync(source);
  fs.rmdirSync(directory);
});
