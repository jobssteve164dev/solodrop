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

test('follows active files, accepts Explorer drops and exposes temporary expiry recovery', () => {
  const extension = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'resources', 'sidebar.js'), 'utf8');

  assert.match(extension, /prepareShareHistorySync\(context\)/);
  assert.match(extension, /onDidChangeActiveTextEditor/);
  assert.match(extension, /provider\.followActiveEditor\(editor\)/);
  assert.match(provider, /setKeysForSync\(\[HISTORY_KEY\]\)/);
  assert.match(provider, /sourcePath: _sourcePath/);
  assert.match(provider, /case 'reshare'/);
  assert.match(provider, /expiresAt: shared\.expiresAt/);
  assert.match(script, /text\.expired/);
  assert.match(script, /post\('reshare', \{ id: record\.id, options: shareOptions\(\) \}\)/);
  assert.match(script, /application\/vnd\.code\.resource/);
  assert.match(script, /text\/plain/);
  assert.match(script, /post\('dropUri', \{ uri, options: shareOptions\(\) \}\)/);
});

test('does not expose platform-owned share-page actions to plugin users', () => {
  const webview = fs.readFileSync(path.join(root, 'src', 'sidebarWebview.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'resources', 'sidebar.js'), 'utf8');

  assert.doesNotMatch(webview, /cta-settings|cta-label|cta-url/);
  assert.doesNotMatch(provider, /CTA_KEY|setCta|message\.cta/);
  assert.doesNotMatch(script, /ctaLabel|ctaUrl|setCta|ctaLoaded/);
});

test('exposes the website share controls and sends them through every share entry', () => {
  const webview = fs.readFileSync(path.join(root, 'src', 'sidebarWebview.ts'), 'utf8');
  const provider = fs.readFileSync(path.join(root, 'src', 'sidebarProvider.ts'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'resources', 'sidebar.js'), 'utf8');

  assert.match(webview, /id="allow-download"/);
  assert.match(webview, /id="watermark"/);
  assert.match(webview, /id="expiry"/);
  assert.match(webview, /value="day"/);
  assert.match(webview, /value="week"/);
  assert.match(webview, /value="month"/);
  assert.match(script, /function shareOptions\(\)/);
  assert.match(script, /post\('share', \{ options: shareOptions\(\) \}\)/);
  assert.match(script, /post\('dropUri', \{ uri, options: shareOptions\(\) \}\)/);
  assert.match(script, /command: 'dropFile',[^\n]+options: shareOptions\(\)/);
  assert.match(provider, /createWebShare\(artifact, options\)/);
});
