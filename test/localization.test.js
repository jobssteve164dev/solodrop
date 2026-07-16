const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('extension manifest translations are complete in English and Chinese', () => {
  const root = path.join(__dirname, '..');
  const manifest = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const keys = [...manifest.matchAll(/%([^%]+)%/g)].map((match) => match[1]);
  const english = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.json'), 'utf8'));
  const chinese = JSON.parse(fs.readFileSync(path.join(root, 'package.nls.zh-cn.json'), 'utf8'));
  for (const key of keys) {
    assert.equal(typeof english[key], 'string', `missing English translation: ${key}`);
    assert.equal(typeof chinese[key], 'string', `missing Chinese translation: ${key}`);
  }
  assert.ok(keys.length > 0);
});
