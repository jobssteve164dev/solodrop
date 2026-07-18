import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { homePage, MAX_FILE_BYTES } from '../worker/src/web.mjs';
import { powScript } from '../worker/src/pow.mjs';
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

test('browser proof-of-work solver produces Cloudflare-compatible checkpoints', () => {
  const window = {};
  const source = powScript().replace('window.SoloDrop={', 'window.SoloDrop={solve:solve,');
  vm.runInNewContext(source, { window, Uint8Array, Uint32Array, DataView, Array, Number, String, Error, atob, btoa });
  const seed = Buffer.alloc(32, 7);
  const actual = window.SoloDrop.solve({challengeToken:'test',seed:seed.toString('base64url'),k:2,g:3},()=>{});
  let hash = createHash('sha256').update(seed).digest();
  const checkpoints = [hash];
  for (let segment=0;segment<2;segment+=1) { for(let i=0;i<3;i+=1) hash=createHash('sha256').update(hash).digest(); checkpoints.push(hash); }
  assert.equal(actual, Buffer.concat(checkpoints).toString('base64'));
});
