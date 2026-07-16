const assert = require('node:assert/strict');
const test = require('node:test');

const { previewInternals } = require('../out/preview.js');

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
