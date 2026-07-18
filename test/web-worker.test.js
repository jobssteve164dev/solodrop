import assert from 'node:assert/strict';
import test from 'node:test';
import { homePage, MAX_FILE_BYTES } from '../worker/src/web.mjs';
import { previewWorker } from '../worker/src/temporary.mjs';

test('web entry requires an account and states the no-file-storage boundary', () => {
  const guest = homePage(null);
  assert.match(guest, /先登录后开始分享/);
  const user = homePage({id:'user-1',email:'user@example.com'});
  assert.match(user, /不保存文件内容/);
  assert.match(user, /Cloudflare 服务条款/);
  assert.equal(MAX_FILE_BYTES, 1024 * 1024);
});

test('temporary preview embeds bytes in the Cloudflare Worker and keeps the platform action external', () => {
  const source = previewWorker('hello.txt','text/plain',new TextEncoder().encode('hello'));
  assert.match(source, /aGVsbG8=/);
  assert.match(source, /https:\/\/drop\.szlk\.ai\/embed\.js/);
  assert.doesNotMatch(source, /R2|Durable Object/);
});
