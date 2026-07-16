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

  assert.match(styles, /body \{ margin: 0; padding: 0;/);
  assert.match(styles, /\.shell \{ padding: 8px 12px 16px; \}/);
  assert.match(styles, /\.share-card \{[\s\S]*?padding: 8px;/);
  assert.match(styles, /\.recent \{ margin-top: 14px; \}/);
});

test('syncs share history and exposes temporary expiry recovery', () => {
  const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'resources', 'sidebar.js'), 'utf8');

  assert.match(extension, /prepareShareHistorySync\(context\)/);
  assert.match(provider, /setKeysForSync\(\[HISTORY_KEY\]\)/);
  assert.match(provider, /sourcePath: _sourcePath/);
  assert.match(provider, /case 'reshare'/);
  assert.match(provider, /expiresAt:/);
  assert.match(script, /text\.expired/);
  assert.match(script, /post\('reshare', \{ id: record\.id \}\)/);
});
