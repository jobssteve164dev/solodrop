import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import worker from '../worker/src/index.mjs';
import { authPage, homePage, MAX_FILE_BYTES } from '../worker/src/web.mjs';
import { powScript } from '../worker/src/pow.mjs';
import { previewWorker, verifyTemporaryPreview } from '../worker/src/temporary.mjs';

test('web entry lets guests share first and offers registration after success', () => {
  const guest = homePage(null);
  assert.match(guest, /无需登录/);
  assert.match(guest, /创建临时分享链接/);
  assert.match(guest, /当前链接无需注册，已经可以使用/);
  assert.doesNotMatch(guest, /先登录后开始分享/);
  const user = homePage({id:'user-1',email:'user@example.com'});
  assert.match(user, /不保存文件内容/);
  assert.match(user, /Cloudflare 服务条款/);
  assert.match(guest, /favicon\.svg/);
  assert.match(guest, /SoloDrop · A SZLK product/);
  assert.equal(MAX_FILE_BYTES, 1024 * 1024);
});

test('publishes complete Chinese and English SEO/GEO entry pages', async () => {
  const zh=homePage(null,'zh');
  const en=homePage(null,'en');
  assert.match(zh, /免费临时文件分享｜无需登录生成网页/);
  assert.match(zh, /hreflang="en" href="https:\/\/drop\.szlk\.ai\/en"/);
  assert.match(zh, /SoloDrop 是什么？/);
  assert.match(en, /<html lang="en">/);
  assert.match(en, /Free Temporary File Sharing — No Sign-Up/);
  assert.match(en, /What is SoloDrop\?/);
  assert.match(en, /Temporary file sharing FAQ/);
  assert.match(en, /\.faq-list\{max-width:none;width:100%;margin-left:0;margin-right:0\}/);
  assert.doesNotMatch(en.replace('>中<','><'), /[\u4e00-\u9fff]/);
  const schema=JSON.parse(en.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/)[1]);
  assert.deepEqual(schema['@graph'].map((item)=>item['@type']),['WebSite','SoftwareApplication','FAQPage']);
  assert.match(authPage('register','', 'en'), /name="locale" value="en"/);

  const env={LINKS:{idFromName:()=>({}),get:()=>({})}};
  const sitemap=await worker.fetch(new Request('https://drop.szlk.ai/sitemap.xml'),env);
  assert.equal(sitemap.status,200);
  assert.match(await sitemap.text(), /<loc>https:\/\/drop\.szlk\.ai\/en<\/loc>/);
  const robots=await worker.fetch(new Request('https://drop.szlk.ai/robots.txt'),env);
  assert.match(await robots.text(), /Sitemap: https:\/\/drop\.szlk\.ai\/sitemap\.xml/);
});

test('temporary preview embeds bytes in the Cloudflare Worker and keeps the platform action external', () => {
  const source = previewWorker('hello.txt','text/plain',new TextEncoder().encode('hello'));
  assert.match(source, /aGVsbG8=/);
  assert.match(source, /https:\/\/drop\.szlk\.ai\/embed\.js/);
  assert.doesNotMatch(source, /R2|Durable Object/);
});

test('website waits through slow temporary Worker route propagation without reusing cached 404s', async () => {
  const requested=[];
  const pauses=[];
  let attempts=0;
  await verifyTemporaryPreview('https://preview.example.workers.dev',async (url,options)=>{
    attempts+=1; requested.push({url:url.toString(),options});
    return new Response(attempts<10?'not found':'<meta name="solodrop-preview">',{status:attempts<10?404:200});
  },async (milliseconds)=>{pauses.push(milliseconds);});
  assert.equal(attempts,10);
  assert.deepEqual(pauses,[1000,2000,3000,5000,8000,10000,10000,10000,10000]);
  assert.equal(new Set(requested.map(({url})=>url)).size,10);
  assert.equal(requested[0].options.cache,'no-store');
  assert.equal(requested[0].options.headers['cache-control'],'no-cache');
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
