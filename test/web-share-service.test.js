const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWebShare } = require('../out/webShareService.js');

test('sends download and watermark controls with a fixed one-day guest lifetime', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solodrop-web-share-test-'));
  const filePath = path.join(directory, 'review.txt');
  fs.writeFileSync(filePath, 'hello');
  let request;
  try {
    const result = await createWebShare(
      { path:filePath, name:'review.txt', size:5, kind:'Text' },
      { allowDownload:false, watermark:'Client review', expiry:'month' },
      async (url, options) => {
        if(String(url)==='https://drop.szlk.ai/Abc2345') return new Response('<meta name="solodrop-preview">');
        request={url,options};
        return new Response(JSON.stringify({shortUrl:'https://drop.szlk.ai/Abc2345',previewUrl:'https://drop.szlk.ai/Abc2345',managementToken:'secret',expiresAt:'2026-08-18T00:00:00.000Z'}),{status:201,headers:{'content-type':'application/json'}});
      }
    );
    assert.equal(request.url,'https://drop.szlk.ai/api/shares');
    assert.equal(request.options.body.get('allowDownload'),'no');
    assert.equal(request.options.body.get('watermark'),'Client review');
    assert.equal(request.options.body.get('expiry'),'day');
    assert.equal(result.shortUrl,'https://drop.szlk.ai/Abc2345');
  } finally {
    fs.unlinkSync(filePath);
    fs.rmdirSync(directory);
  }
});

test('rejects a share link returned from an unexpected origin', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solodrop-web-share-test-'));
  const filePath = path.join(directory, 'review.txt');
  fs.writeFileSync(filePath, 'hello');
  try {
    await assert.rejects(()=>createWebShare(
      { path:filePath, name:'review.txt', size:5, kind:'Text' },
      { allowDownload:true, watermark:'', expiry:'day' },
      async()=>new Response(JSON.stringify({shortUrl:'https://evil.example/x',previewUrl:'https://evil.example/x',managementToken:'secret',expiresAt:'2026-08-18T00:00:00.000Z'}),{status:201})
    ),/unexpected link/);
  } finally {
    fs.unlinkSync(filePath);
    fs.rmdirSync(directory);
  }
});

test('sends Markdown with a renderable content type', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'solodrop-web-share-test-'));
  const filePath = path.join(directory, 'result.md'); fs.writeFileSync(filePath, '# Result');
  let uploaded;
  try {
    await createWebShare({path:filePath,name:'result.md',size:8,kind:'Markdown'},{allowDownload:true,watermark:'',expiry:'day'},async(url,options)=>{
      if(String(url).includes('Abc2345')) return new Response('<meta name="solodrop-preview">');
      uploaded=options.body.get('file');
      return new Response(JSON.stringify({shortUrl:'https://drop.szlk.ai/Abc2345',previewUrl:'https://drop.szlk.ai/Abc2345',managementToken:'secret',expiresAt:'2026-08-18T00:00:00.000Z'}),{status:201,headers:{'content-type':'application/json'}});
    });
    assert.equal(uploaded.type,'text/markdown');
  } finally { fs.unlinkSync(filePath); fs.rmdirSync(directory); }
});
