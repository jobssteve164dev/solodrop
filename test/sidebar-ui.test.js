const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('ships sidebar styles in the initial webview document', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'sidebarWebview.ts'), 'utf8');

  assert.match(source, /readFileSync\([\s\S]*sidebar\.css/);
  assert.match(source, /<style nonce="\$\{nonce\}">\$\{styles\}<\/style>/);
  assert.doesNotMatch(source, /<link rel="stylesheet"/);
});

test('keeps the sidebar shell on the compact spacing scale', () => {
  const styles = fs.readFileSync(path.join(root, 'resources', 'sidebar.css'), 'utf8');

  assert.match(styles, /\.shell \{ padding: 8px 4px 16px; \}/);
  assert.match(styles, /\.share-card \{[\s\S]*?padding: 8px;/);
  assert.match(styles, /\.recent \{ margin-top: 14px; \}/);
});
