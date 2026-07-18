const MAX_SHARE_BYTES = 10 * 1024 * 1024;
const EXPIRY_MS = { day: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000 };
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[character]));
const safeName = (value) => String(value || 'shared-file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || 'shared-file';

function randomValue(length = 24) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => ALPHABET[value % ALPHABET.length]).join('');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function metadataKey(slug) { return `shares/${slug}.json`; }
function contentKey(slug) { return `content/${slug}`; }

async function readMetadata(bucket, slug) {
  const object = await bucket.get(metadataKey(slug));
  if (!object) return null;
  try { return await object.json(); } catch { return null; }
}

function previewBody(meta) {
  const name = esc(meta.name), encoded = encodeURIComponent(meta.slug);
  const content = `/api/shares/${encoded}/content`;
  const extension = meta.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  if (extension === '.docx' || extension === '.pptx') return `<div class="office-viewer" data-office-format="${extension.slice(1)}" data-office-src="${content}"></div><script type="module" src="/office-viewer.js?v=1"></script>`;
  if (meta.type.startsWith('image/')) return `<img class="media" src="${content}" alt="${name}">`;
  if (meta.type === 'application/pdf' || extension === '.pdf') return `<embed class="pdf" src="${content}" type="application/pdf"><p><a class="open-pdf" href="${content}">Open the PDF</a></p>`;
  if (meta.type === 'text/html' || ['.html','.htm'].includes(extension)) return `<iframe class="pdf" sandbox="allow-scripts" src="${content}" title="${name}"></iframe>`;
  if (meta.type.startsWith('text/') || /json|javascript|xml/.test(meta.type)) return `<pre id="text-preview"><code></code></pre><script>fetch(${JSON.stringify(content)}).then(r=>r.text()).then(value=>document.querySelector('#text-preview code').textContent=value)<\/script>`;
  return `<div class="file-fallback"><h1>${name}</h1><p>This file is available from its share page.</p></div>`;
}

function watermark(text) {
  if (!text) return '';
  const cells = Array.from({ length: 18 }, () => `<span>${esc(text)}</span>`).join('');
  return `<div class="watermark" aria-hidden="true">${cells}</div>`;
}

function previewPage(meta) {
  const download = meta.allowDownload ? `<a class="download" href="/api/shares/${encodeURIComponent(meta.slug)}/content?download=1" download>Download</a>` : '';
  const selectionProtection = meta.watermark ? '<style>.content,.content *{-webkit-user-select:none;user-select:none}.content .pdf{pointer-events:none}</style><script>document.addEventListener("copy",function(event){if(event.target.closest(".content"))event.preventDefault()});document.addEventListener("selectstart",function(event){if(event.target.closest(".content"))event.preventDefault()})<\/script>' : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="solodrop-preview" content="r2-v1"><meta name="robots" content="noindex,nofollow"><title>${esc(meta.name)}</title><style>
:root{font-family:Inter,"Noto Sans SC",system-ui,sans-serif;color:#20212b;background:#f7f7fb;--brand:#5046e5;--surface:#fff;--line:#e2e3ed;--muted:#666979}*{box-sizing:border-box}body{margin:0}.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;background:rgba(255,255,255,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.brand{display:flex;align-items:center;gap:10px;min-width:0;font-weight:750}.mark{width:28px;height:28px;border-radius:8px;background:var(--brand);color:#fff;display:grid;place-items:center}.title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.download{min-height:44px;display:inline-flex;align-items:center;color:#4546bd;font-weight:700;text-decoration:none}.content{position:relative;z-index:1;width:min(100% - 32px,960px);min-height:60vh;margin:36px auto 24px;padding:clamp(20px,4vw,48px);background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 18px 60px rgba(30,31,62,.08);overflow:auto}.media{display:block;max-width:100%;margin:auto}.pdf{width:100%;height:78vh;border:0}.office-viewer{min-height:50vh}.office-status,.file-fallback{text-align:center;color:var(--muted);padding:40px 16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}.share-actions{position:relative;z-index:3;width:min(100% - 32px,960px);margin:0 auto 44px;display:flex;justify-content:flex-end;gap:12px}.solodrop-cta,.solodrop-powered{min-height:44px;display:inline-flex;align-items:center;text-decoration:none;font-weight:650}.solodrop-cta{padding:0 18px;border-radius:10px;background:var(--brand);color:#fff}.solodrop-powered{color:var(--muted)}.watermark{position:fixed;inset:0;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:150px;place-items:center;overflow:hidden;pointer-events:none;user-select:none}.watermark span{max-width:220px;color:rgba(67,58,150,.16);font-size:18px;font-weight:760;transform:rotate(-24deg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(max-width:600px){.top{padding:10px 16px}.content{width:100%;margin:0 0 20px;border:0;border-radius:0;padding:22px 18px}.watermark{grid-template-columns:repeat(2,1fr)}.share-actions{width:100%;padding:0 18px;display:grid}.solodrop-cta,.solodrop-powered{justify-content:center}}
</style>${selectionProtection}</head><body><header class="top"><div class="brand"><span class="mark">S</span><span class="title">${esc(meta.name)}</span></div>${download}</header><main class="content">${previewBody(meta)}</main>${watermark(meta.watermark)}<aside class="share-actions" data-solodrop-actions hidden aria-label="Shared page actions"></aside><script defer src="/embed.js?v=3"></script></body></html>`;
}

async function createShare(request, env, user, registry, origin, claimToken = null) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) throw new Error('请选择要分享的文件。');
  if (file.size > MAX_SHARE_BYTES) throw new Error('当前支持最大 10 MB 的文件。');
  const expiry = String(form.get('expiry') || 'week');
  if (!(expiry in EXPIRY_MS) && !(expiry === 'never' && user)) throw new Error('分享有效期无效。');
  const allowDownload = form.get('allowDownload') !== 'no';
  const watermarkText = String(form.get('watermark') || '').trim().slice(0, 60);
  let slug=randomValue(7);
  for(let attempt=0;attempt<5&&await env.PREVIEWS.head(metadataKey(slug));attempt+=1)slug=randomValue(7);
  if(await env.PREVIEWS.head(metadataKey(slug)))throw new Error('暂时无法生成唯一链接，请重试。');
  const managementToken = randomValue(28), now = Date.now();
  const expiresAt = expiry === 'never' ? null : now + EXPIRY_MS[expiry];
  const meta = { slug, name: safeName(file.name), type: file.type || 'application/octet-stream', size: file.size, allowDownload, watermark: watermarkText, createdAt: now, expiresAt, ownerId: user?.id || null, managementHash: await sha256(managementToken) };
  await env.PREVIEWS.put(contentKey(slug), file.stream(), { httpMetadata: { contentType: meta.type } });
  try {
    await env.PREVIEWS.put(metadataKey(slug), JSON.stringify(meta), { httpMetadata: { contentType: 'application/json' } });
  } catch (error) {
    await env.PREVIEWS.delete(contentKey(slug));
    throw error;
  }
  if (user) {
    const activityId=crypto.randomUUID();
    await registry.fetch('https://registry/activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:activityId,userId:user.id,email:user.email,fileName:meta.name,sizeBytes:meta.size,contentType:meta.type,status:'ready'})});
    await registry.fetch(`https://registry/activity/${activityId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'ready',shortSlug:slug,previewUrl:`${origin}/${slug}`,expiresAt:expiresAt?new Date(expiresAt).toISOString():null})});
  } else if (claimToken) {
    await registry.fetch('https://registry/guest-activity',{method:'POST',headers:{'content-type':'application/json','x-claim-token':claimToken},body:JSON.stringify({id:crypto.randomUUID(),fileName:meta.name,sizeBytes:meta.size,contentType:meta.type,status:'ready',shortSlug:slug,previewUrl:`${origin}/${slug}`,expiresAt:expiresAt?new Date(expiresAt).toISOString():null})});
  }
  return { shortUrl: `${origin}/${slug}`, previewUrl: `${origin}/${slug}`, managementToken, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null };
}

async function serveShare(slug, env) {
  const meta = await readMetadata(env.PREVIEWS, slug);
  if (!meta) return new Response('Not found.', { status: 404 });
  if (meta.expiresAt && Date.now() >= meta.expiresAt) return new Response('This share has expired.', { status: 410 });
  return new Response(previewPage(meta), { headers: { 'content-type':'text/html;charset=utf-8', 'cache-control':'no-store', 'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; object-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer' } });
}

async function serveContent(request, slug, env) {
  const meta = await readMetadata(env.PREVIEWS, slug);
  if (!meta) return new Response('Not found.', { status: 404 });
  if (meta.expiresAt && Date.now() >= meta.expiresAt) return new Response('This share has expired.', { status: 410 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  if (download && !meta.allowDownload) return new Response('Downloads are disabled for this share.', { status: 403 });
  const object = await env.PREVIEWS.get(contentKey(slug), { range: request.headers });
  if (!object) return new Response('Not found.', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private,max-age=300');
  headers.set('content-disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { status: object.range ? 206 : 200, headers });
}

async function deleteShare(request, slug, env, user = null) {
  const meta = await readMetadata(env.PREVIEWS, slug);
  if (!meta) return new Response(null, { status: 204 });
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if ((!token || await sha256(token) !== meta.managementHash) && (!user || user.id !== meta.ownerId)) return new Response(JSON.stringify({ error:'Not authorized.' }), { status:403, headers:{'content-type':'application/json'} });
  await env.PREVIEWS.delete([metadataKey(slug), contentKey(slug)]);
  return new Response(null, { status: 204 });
}

async function purgeExpiredShares(env) {
  let cursor;
  do {
    const listed = await env.PREVIEWS.list({ prefix:'shares/', cursor, limit:500 });
    for (const entry of listed.objects) {
      const meta = await readMetadata(env.PREVIEWS, entry.key.slice(7, -5));
      if (meta?.expiresAt && Date.now() >= meta.expiresAt) await env.PREVIEWS.delete([entry.key, contentKey(meta.slug)]);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export { MAX_SHARE_BYTES, createShare, deleteShare, previewPage, purgeExpiredShares, serveContent, serveShare };
