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
  if (['.md','.markdown'].includes(extension)) return `<article id="markdown-preview" class="markdown-preview"></article><script>function e(v){return v.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}function m(v){return e(v).replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>').replace(/\x60\x60\x60([\\s\\S]*?)\x60\x60\x60/g,'<pre><code>$1</code></pre>').replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/^- (.+)$/gm,'<li>$1</li>').split(/\\n{2,}/).map(b=>/^(?:<h\\d|<pre|<li)/.test(b)?b:'<p>'+b.replace(/\\n/g,'<br>')+'</p>').join('')}fetch(${JSON.stringify(content)}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(v=>document.querySelector('#markdown-preview').innerHTML=m(v)).catch(()=>document.querySelector('#markdown-preview').textContent='Unable to load this preview.')<\/script>`;
  if (meta.type.startsWith('text/') || /json|javascript|xml/.test(meta.type) || ['.md','.markdown','.txt','.csv','.yml','.yaml','.toml','.sql','.sh','.py','.go','.rs','.java','.c','.cpp','.h','.ts','.tsx'].includes(extension)) return `<pre id="text-preview"><code></code></pre><script>fetch(${JSON.stringify(content)}).then(r=>r.text()).then(value=>document.querySelector('#text-preview code').textContent=value)<\/script>`;
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

function expiredPage(locale = 'zh') {
  const en = locale === 'en';
  const home = en ? '/en' : '/';
  const copy = en ? {
    lang: 'en',
    title: 'This share has expired',
    description: 'The file is no longer available because this link has reached the lifetime chosen by the sender.',
    recovery: 'Ask the sender to create and send you a new share link.',
    action: 'Go to SoloDrop'
  } : {
    lang: 'zh-CN',
    title: '这个分享链接已过期',
    description: '这个链接已超过分享者设置的有效期，文件现在无法继续访问。',
    recovery: '请联系分享者重新生成并发送一个新的分享链接。',
    action: '返回 SoloDrop'
  };
  return `<!doctype html><html lang="${copy.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f7f7fc"><meta name="robots" content="noindex,nofollow"><title>${copy.title} · SoloDrop</title><style>
:root{font-family:Inter,"Noto Sans SC",ui-sans-serif,system-ui,-apple-system,sans-serif;color:#171724;background:#f7f7fc;--brand:#5046e5;--brand-dark:#3f37c9;--muted:#626274;--line:#e5e5ef;--surface:#fff;--soft:#f0efff}*{box-sizing:border-box}body{margin:0;min-width:320px;min-height:100vh;min-height:100dvh;background:radial-gradient(circle at 50% 15%,#eceaff 0,rgba(236,234,255,0) 38%),#f7f7fc}.page{width:min(calc(100% - 32px),720px);min-height:100vh;min-height:100dvh;margin:auto;padding:32px 0;display:grid;grid-template-rows:auto 1fr auto}.brand{width:max-content;min-height:44px;display:inline-flex;align-items:center;gap:11px;color:#171724;font-size:20px;font-weight:820;letter-spacing:-.02em;text-decoration:none}.brand-mark{width:36px;height:36px;display:block}.state{align-self:center;text-align:center;padding:56px clamp(24px,7vw,64px);background:var(--surface);border:1px solid var(--line);border-radius:24px;box-shadow:0 24px 70px rgba(31,30,64,.11)}.state-icon{width:72px;height:72px;margin:0 auto 26px;display:grid;place-items:center;color:var(--brand);background:var(--soft);border-radius:22px}.state-icon svg{width:36px;height:36px}.state h1{max-width:560px;margin:0 auto;font-size:clamp(32px,6vw,48px);line-height:1.12;letter-spacing:-.045em}.description{max-width:540px;margin:20px auto 0;color:var(--muted);font-size:17px;line-height:1.7}.recovery{max-width:520px;margin:12px auto 0;color:#3f3f50;font-size:16px;line-height:1.65}.action{min-height:48px;margin-top:30px;padding:0 21px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:var(--brand);color:#fff;font-weight:760;text-decoration:none;transition:background .18s,box-shadow .18s}.action:hover{background:var(--brand-dark);box-shadow:0 10px 28px rgba(80,70,229,.2)}.action:focus-visible,.brand:focus-visible{outline:3px solid #9ca3ff;outline-offset:3px}.footer{padding:26px 0 2px;text-align:center;color:#777789;font-size:13px}@media(max-width:560px){.page{padding:20px 0}.state{padding:44px 22px;border-radius:20px}.state-icon{width:64px;height:64px;border-radius:19px}.description{font-size:16px}.action{width:100%}}@media(prefers-reduced-motion:reduce){.action{transition:none}}@media(prefers-color-scheme:dark){:root{color:#f4f3fb;background:#11111a;--muted:#b9b8c8;--line:#303040;--surface:#1a1a25;--soft:#292744}.brand{color:#f4f3fb}body{background:radial-gradient(circle at 50% 15%,#242146 0,rgba(36,33,70,0) 40%),#11111a}.recovery{color:#d7d6e1}.footer{color:#9998aa}.state{box-shadow:0 24px 70px rgba(0,0,0,.28)}}
</style></head><body><main class="page"><a class="brand" href="${home}" aria-label="SoloDrop"><svg class="brand-mark" viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="28" fill="#5046e5"/><path d="M64 22c15.5 18.5 27 31.7 27 49.2C91 87 79.2 99 64 99S37 87 37 71.2C37 53.7 48.5 40.5 64 22Z" fill="#fff"/><path d="M49 68.5 64 83l15-14.5M64 48v34" fill="none" stroke="#5046e5" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>SoloDrop</span></a><section class="state" aria-labelledby="expired-title"><div class="state-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v5l3.25 1.85" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h1 id="expired-title">${copy.title}</h1><p class="description">${copy.description}</p><p class="recovery">${copy.recovery}</p><a class="action" href="${home}">${copy.action}</a></section><footer class="footer">© 2026 SoloDrop · A SZLK product</footer></main></body></html>`;
}

async function createShare(request, env, user, registry, origin, claimToken = null) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) throw new Error('请选择要分享的文件。');
  if (file.size > MAX_SHARE_BYTES) throw new Error('当前支持最大 10 MB 的文件。');
  const expiry = String(form.get('expiry') || (user ? 'week' : 'day'));
  if (!user && expiry !== 'day') throw new Error('未登录用户只能创建 1 天有效期的分享。');
  if (user && !(expiry in EXPIRY_MS) && expiry !== 'never') throw new Error('分享有效期无效。');
  const allowDownload = form.get('allowDownload') !== 'no';
  const watermarkText = String(form.get('watermark') || '').trim().slice(0, 60);
  let slug=randomValue(7);
  for(let attempt=0;attempt<5&&await env.PREVIEWS.head(metadataKey(slug));attempt+=1)slug=randomValue(7);
  if(await env.PREVIEWS.head(metadataKey(slug)))throw new Error('暂时无法生成唯一链接，请重试。');
  const managementToken = randomValue(28), now = Date.now();
  const expiresAt = expiry === 'never' ? null : now + EXPIRY_MS[expiry];
  const inferredText = /\.(?:md|markdown|txt|csv|yml|yaml|toml|sql|sh|py|go|rs|java|c|cpp|h|ts|tsx)$/i.test(file.name);
  const meta = { slug, name: safeName(file.name), type: file.type || (inferredText ? 'text/plain' : 'application/octet-stream'), size: file.size, allowDownload, watermark: watermarkText, createdAt: now, expiresAt, ownerId: user?.id || null, managementHash: await sha256(managementToken) };
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

async function serveShare(slug, env, request = null) {
  const meta = await readMetadata(env.PREVIEWS, slug);
  if (!meta) return new Response('Not found.', { status: 404 });
  if (meta.expiresAt && Date.now() >= meta.expiresAt) {
    const locale = /^en(?:-|,|;|$)/i.test(request?.headers.get('accept-language') || '') ? 'en' : 'zh';
    return new Response(expiredPage(locale), { status: 410, headers: { 'content-type':'text/html;charset=utf-8', 'cache-control':'no-store', 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer' } });
  }
  return new Response(previewPage(meta), { headers: { 'content-type':'text/html;charset=utf-8', 'cache-control':'no-store', 'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; object-src 'self'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", 'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer' } });
}

async function serveContent(request, slug, env) {
  const meta = await readMetadata(env.PREVIEWS, slug);
  if (!meta) return new Response('Not found.', { status: 404 });
  if (meta.expiresAt && Date.now() >= meta.expiresAt) return new Response('This share has expired.', { status: 410 });
  const download = new URL(request.url).searchParams.get('download') === '1';
  if (download && !meta.allowDownload) return new Response('Downloads are disabled for this share.', { status: 403 });
  const requestedRange = request.headers.has('range');
  const object = await env.PREVIEWS.get(contentKey(slug), requestedRange ? { range: request.headers } : undefined);
  if (!object) return new Response('Not found.', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'private,max-age=300');
  headers.set('content-disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('accept-ranges', 'bytes');
  if (requestedRange && object.range && Number.isInteger(object.range.offset) && Number.isInteger(object.range.length)) {
    headers.set('content-range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
  }
  return new Response(object.body, { status: requestedRange && object.range ? 206 : 200, headers });
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

export { MAX_SHARE_BYTES, createShare, deleteShare, expiredPage, previewPage, purgeExpiredShares, serveContent, serveShare };
