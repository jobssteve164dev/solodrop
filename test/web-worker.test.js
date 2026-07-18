import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/src/index.mjs';
import { authPage, homePage, MAX_FILE_BYTES } from '../worker/src/web.mjs';
import { powScript } from '../worker/src/pow.mjs';
import { previewWorker, verifyTemporaryPreview } from '../worker/src/temporary.mjs';
import { createShare, previewPage, serveContent } from '../worker/src/shares.mjs';

test('web entry lets guests share first and offers registration after success', () => {
  const guest = homePage(null);
  assert.match(guest, /无需登录/);
  assert.match(guest, /创建分享链接/);
  assert.match(guest, /文件加密存储/);
  assert.match(guest, /允许下载原文件/);
  assert.match(guest, /文字水印/);
  assert.doesNotMatch(guest, /先登录后开始分享/);
  const user = homePage({id:'user-1',email:'user@example.com'});
  assert.match(user, /长期保留/);
  assert.match(guest, /favicon\.svg/);
  assert.match(guest, /SoloDrop · A SZLK product/);
  assert.equal(MAX_FILE_BYTES, 10 * 1024 * 1024);
});

test('publishes complete Chinese and English SEO/GEO entry pages', async () => {
  const zh=homePage(null,'zh');
  const en=homePage(null,'en');
  assert.match(zh, /可控文件分享｜生成带水印的网页预览/);
  assert.match(zh, /hreflang="en" href="https:\/\/drop\.szlk\.ai\/en"/);
  assert.match(zh, /SoloDrop 是什么？/);
  assert.match(en, /<html lang="en">/);
  assert.match(en, /Controlled File Sharing as a Web Page/);
  assert.match(en, /What is SoloDrop\?/);
  assert.match(en, /Temporary file sharing FAQ|Straight answers/);
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

test('temporary Office previews load the shared browser renderer', () => {
  const docx=previewWorker('proposal.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',new Uint8Array([1,2,3]));
  const pptx=previewWorker('deck.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',new Uint8Array([1,2,3]));
  assert.match(docx,/office-viewer\.js/);
  assert.match(docx,/docx\?'docx':'pptx'/);
  assert.match(pptx,/office-viewer\.js/);
});

test('Office viewer asset is loadable as a cross-origin module', async () => {
  const env={
    LINKS:{idFromName:()=>({}),get:()=>({})},
    ASSETS:{fetch:async ()=>new Response('export default true',{headers:{'content-type':'text/javascript'}})}
  };
  const response=await worker.fetch(new Request('https://drop.szlk.ai/office-viewer.js'),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),'*');
  assert.equal(await response.text(),'export default true');
  const head=await worker.fetch(new Request('https://drop.szlk.ai/office-viewer.js',{method:'HEAD'}),env);
  assert.equal(head.status,200);
  assert.equal(await head.text(),'');
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

test('browser submits R2 share controls instead of temporary Worker proof-of-work', () => {
  const source=powScript();
  assert.match(source,/fetch\('\/api\/shares'/);
  assert.match(source,/allowDownload/);
  assert.match(source,/watermark/);
  assert.match(source,/expiry/);
  assert.doesNotMatch(source,/api\/temp\/challenge/);
});

test('R2 shares enforce download preference and render escaped watermarks', async () => {
  const objects=new Map();
  const bucket={
    async head(key){return objects.has(key)?{}:null;},
    async put(key,value,options={}){objects.set(key,{bytes:new Uint8Array(await new Response(value).arrayBuffer()),type:options.httpMetadata?.contentType||'application/octet-stream'});},
    async get(key){const item=objects.get(key);if(!item)return null;return {body:item.bytes,httpEtag:'"test"',range:null,async json(){return JSON.parse(new TextDecoder().decode(item.bytes));},writeHttpMetadata(headers){headers.set('content-type',item.type);}};},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}
  };
  const form=new FormData();
  form.set('file',new File(['hello'],'review.txt',{type:'text/plain'}));
  form.set('allowDownload','no');
  form.set('watermark','Client <review>');
  form.set('expiry','week');
  const registry={fetch:async()=>new Response('{}')};
  const created=await createShare(new Request('https://drop.szlk.ai/api/shares',{method:'POST',body:form}),{PREVIEWS:bucket},null,registry,'https://drop.szlk.ai');
  const slug=new URL(created.shortUrl).pathname.slice(1);
  const page=previewPage(JSON.parse(new TextDecoder().decode(objects.get(`shares/${slug}.json`).bytes)));
  assert.match(page,/Client &lt;review&gt;/);
  assert.doesNotMatch(page,/class="download"/);
  const inline=await serveContent(new Request(`https://drop.szlk.ai/api/shares/${slug}/content`),slug,{PREVIEWS:bucket});
  assert.equal(inline.status,200);
  const download=await serveContent(new Request(`https://drop.szlk.ai/api/shares/${slug}/content?download=1`),slug,{PREVIEWS:bucket});
  assert.equal(download.status,403);
});
