import { handleAuth, sessionUser } from './auth.mjs';
import { challenge, deployTemporary } from './temporary.mjs';
import { LOGO_SVG, SITE_URL, SOCIAL_CARD_SVG, accountPage, authPage, homePage, legalPage, localizeSecondaryPage, shell } from './web.mjs';
import { powScript } from './pow.mjs';

const SERVICE_NAME = 'SoloDrop';
const MAX_CREATES_PER_DAY = 40;
const MAX_TEMPORARY_LIFETIME_MS = 61 * 60 * 1000;
const MAX_PERSISTENT_LIFETIME_MS = 366 * 24 * 60 * 60 * 1000;
const SLUG_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

function corsHeaders(request) {
  const requested = request.headers.get('access-control-request-headers');
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': requested || 'content-type',
    'access-control-max-age': '86400'
  };
}

function randomSlug(length = 7, random = crypto.getRandomValues.bind(crypto)) {
  const bytes = new Uint8Array(length);
  random(bytes);
  return [...bytes].map((value) => SLUG_ALPHABET[value % SLUG_ALPHABET.length]).join('');
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeTarget(value) {
  let target;
  try { target = new URL(value); } catch { throw new Error('The preview URL is invalid.'); }
  if (target.protocol !== 'https:' || target.username || target.password || target.port) {
    throw new Error('The preview URL must use HTTPS without credentials or a custom port.');
  }
  const hostname = target.hostname.toLowerCase();
  if (hostname !== 'workers.dev' && !hostname.endsWith('.workers.dev')) {
    throw new Error('SoloDrop short links only accept Cloudflare Workers previews.');
  }
  target.hash = '';
  return target.toString();
}

const PLATFORM_ACTION = Object.freeze({
  label: 'Share your own file',
  url: 'https://drop.szlk.ai/'
});

function withLinkMarker(target, slug) {
  const url = new URL(target);
  url.searchParams.set('sd', slug);
  return url.toString();
}

async function verifyPreview(target, fetcher = fetch) {
  const response = await fetcher(target, {
    headers: { accept: 'text/html', range: 'bytes=0-65535', 'user-agent': 'SoloDrop-Link-Validator/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`The preview returned HTTP ${response.status}.`);
  const finalUrl = new URL(response.url || target);
  if (!finalUrl.hostname.endsWith('.workers.dev')) throw new Error('The preview redirected outside Cloudflare Workers.');
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) throw new Error('The preview did not return HTML.');
  const body = (await response.text()).slice(0, 65536);
  if (!body.includes('name="solodrop-preview"')) throw new Error('The target is not a SoloDrop preview.');
}

function renderEmbedScript() {
  return `(function(){try{var slot=document.querySelector('[data-solodrop-actions]');if(!slot)return;function render(d){var f=document.createDocumentFragment();if(d.action){var a=document.createElement('a');a.className='solodrop-cta';a.href=d.action.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=d.action.label;f.appendChild(a)}var b=document.createElement('a');b.className='solodrop-powered';b.href='https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop';b.target='_blank';b.rel='noopener noreferrer';b.textContent='Shared with SoloDrop';f.appendChild(b);slot.replaceChildren(f);slot.hidden=false}render({action:{label:${JSON.stringify(PLATFORM_ACTION.label)},url:${JSON.stringify(PLATFORM_ACTION.url)}}});var s=new URL(location.href).searchParams.get('sd');if(!s)return;fetch('https://drop.szlk.ai/api/links/'+encodeURIComponent(s)+'/config',{mode:'cors'}).then(function(r){if(!r.ok)throw new Error();return r.json()}).then(render).catch(function(){})}catch(e){}})();`;
}

export class LinkRegistry {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS links (
      slug TEXT PRIMARY KEY,
      target_url TEXT NOT NULL,
      title TEXT NOT NULL,
      cta_label TEXT,
      cta_url TEXT,
      temporary INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      clicks INTEGER NOT NULL DEFAULT 0
      ,management_hash TEXT NOT NULL
    ); CREATE TABLE IF NOT EXISTS rate_limits (
      rate_key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ); CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      file_name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      content_type TEXT,
      status TEXT NOT NULL,
      short_slug TEXT,
      preview_url TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/session') return this.session(request);
    if (url.pathname === '/activity' && request.method === 'POST') return this.createActivity(request);
    if (url.pathname === '/activities' && request.method === 'GET') return this.listActivities(request);
    const activity = url.pathname.match(/^\/activity\/([a-f0-9-]+)$/);
    if (activity && request.method === 'PATCH') return this.updateActivity(activity[1], request);
    if (request.method === 'POST' && url.pathname === '/create') return this.create(request);
    const match = url.pathname.match(/^\/links\/([A-Za-z0-9]+)(?:\/(config|stats))?$/);
    if (request.method === 'GET' && match) {
      if (match[2] === 'stats') return this.stats(match[1], request.headers.get('x-management-token') || '');
      return this.read(match[1], match[2] === 'config');
    }
    if (request.method === 'DELETE' && match && !match[2]) return this.remove(match[1], request.headers.get('x-management-token') || '');
    return json({ error: 'Not found.' }, 404);
  }

  async session(request) {
    const token = request.headers.get('x-session-token') || '';
    if (!token) return json({error:'Unauthorized.'},401);
    const hash = await sha256(token), now = Date.now();
    if (request.method === 'POST') {
      const body = await request.json();
      const user = body.user || body;
      if (!user.id || !user.email) return json({error:'Invalid user.'},400);
      this.sql.exec(`INSERT OR REPLACE INTO sessions (token_hash,user_id,email,name,created_at,expires_at) VALUES (?,?,?,?,?,?)`,hash,user.id,user.email,user.name || '',now,now+30*24*60*60*1000);
      return json({ok:true},201);
    }
    if (request.method === 'DELETE') { this.sql.exec('DELETE FROM sessions WHERE token_hash = ?',hash); return new Response(null,{status:204}); }
    const row=[...this.sql.exec('SELECT user_id AS id,email,name,expires_at FROM sessions WHERE token_hash = ?',hash)][0];
    if (!row || row.expires_at <= now) { if(row)this.sql.exec('DELETE FROM sessions WHERE token_hash = ?',hash); return json({error:'Unauthorized.'},401); }
    return json(row);
  }

  async createActivity(request) {
    const b=await request.json(), now=Date.now();
    if(!b.id||!b.userId||!b.fileName) return json({error:'Invalid activity.'},400);
    this.sql.exec(`INSERT INTO activities (id,user_id,email,file_name,size_bytes,content_type,status,created_at) VALUES (?,?,?,?,?,?,?,?)`,b.id,b.userId,b.email||'',b.fileName,b.sizeBytes||0,b.contentType||'',b.status||'provisioning',now);
    return json({ok:true},201);
  }

  async updateActivity(id, request) {
    const b=await request.json();
    this.sql.exec(`UPDATE activities SET status=?,short_slug=COALESCE(?,short_slug),preview_url=COALESCE(?,preview_url),expires_at=COALESCE(?,expires_at) WHERE id=?`,b.status||'failed',b.shortSlug||null,b.previewUrl||null,b.expiresAt?Date.parse(b.expiresAt):null,id);
    return json({ok:true});
  }

  listActivities(request) {
    const userId=request.headers.get('x-user-id');
    if(!userId)return json({error:'Unauthorized.'},401);
    const rows=[...this.sql.exec('SELECT file_name,size_bytes,status,short_slug,created_at,expires_at FROM activities WHERE user_id=? ORDER BY created_at DESC LIMIT 50',userId)];
    return json(rows);
  }

  enforceRateLimit(ip, now) {
    const day = new Date(now).toISOString().slice(0, 10);
    const rateKey = `${day}:${ip || 'unknown'}`;
    const row = [...this.sql.exec('SELECT count FROM rate_limits WHERE rate_key = ?', rateKey)][0];
    if ((row?.count || 0) >= MAX_CREATES_PER_DAY) throw new Error('Daily short-link limit reached. Try again tomorrow.');
    this.sql.exec(`INSERT INTO rate_limits (rate_key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(rate_key) DO UPDATE SET count = count + 1`, rateKey, now + 2 * 24 * 60 * 60 * 1000);
    if (Math.random() < 0.02) this.sql.exec('DELETE FROM rate_limits WHERE expires_at < ?', now);
  }

  async create(request) {
    const now = Date.now();
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
    try {
      this.enforceRateLimit(request.headers.get('x-solodrop-client-ip') || '', now);
      const target = normalizeTarget(body.url);
      const title = String(body.title || 'Shared preview').trim().slice(0, 160) || 'Shared preview';
      const temporary = body.temporary === true;
      const managementToken = randomToken();
      const managementHash = await sha256(managementToken);
      let expiresAt = body.expiresAt ? Date.parse(body.expiresAt) : null;
      if (temporary && !expiresAt) expiresAt = now + 60 * 60 * 1000;
      if (expiresAt && (!Number.isFinite(expiresAt) || expiresAt <= now)) throw new Error('The expiry must be in the future.');
      const maxLifetime = temporary ? MAX_TEMPORARY_LIFETIME_MS : MAX_PERSISTENT_LIFETIME_MS;
      if (expiresAt && expiresAt - now > maxLifetime) throw new Error('The requested expiry is too far in the future.');
      let slug = randomSlug();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const exists = [...this.sql.exec('SELECT 1 FROM links WHERE slug = ?', slug)][0];
        if (!exists) break;
        slug = randomSlug();
      }
      this.sql.exec(`INSERT INTO links (slug, target_url, title, cta_label, cta_url, temporary, created_at, expires_at, management_hash)
        VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?)`, slug, target, title, temporary ? 1 : 0, now, expiresAt, managementHash);
      return json({ slug, managementToken, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Could not create short link.' }, 422);
    }
  }

  read(slug, configOnly) {
    const row = [...this.sql.exec('SELECT * FROM links WHERE slug = ?', slug)][0];
    if (!row) return json({ error: 'Link not found.' }, 404);
    if (row.expires_at && Date.now() >= row.expires_at) return json({ error: 'Link expired.' }, 410);
    if (configOnly) {
      return json({
        title: row.title,
        action: PLATFORM_ACTION
      }, 200, { 'access-control-allow-origin': '*' });
    }
    this.sql.exec('UPDATE links SET clicks = clicks + 1 WHERE slug = ?', slug);
    return json({ target: withLinkMarker(row.target_url, slug) });
  }

  async stats(slug, token) {
    const row = [...this.sql.exec('SELECT clicks, created_at, expires_at, management_hash FROM links WHERE slug = ?', slug)][0];
    if (!row) return json({ error: 'Link not found.' }, 404);
    if (!token || await sha256(token) !== row.management_hash) return json({ error: 'Not authorized.' }, 403);
    return json({ clicks: row.clicks, createdAt: new Date(row.created_at).toISOString(), expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null });
  }

  async remove(slug, token) {
    const row = [...this.sql.exec('SELECT management_hash FROM links WHERE slug = ?', slug)][0];
    if (!row) return json({ error: 'Link not found.' }, 404);
    if (!token || await sha256(token) !== row.management_hash) return json({ error: 'Not authorized.' }, 403);
    this.sql.exec('DELETE FROM links WHERE slug = ?', slug);
    return new Response(null, { status: 204 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const locale=url.pathname==='/en'||url.pathname.startsWith('/en/')?'en':'zh';
    const pagePath=locale==='en'?(url.pathname.slice(3)||'/'):url.pathname;
    const registry=env.LINKS.get(env.LINKS.idFromName('registry'));
    const origin=url.origin;
    if (request.method === 'GET' && pagePath === '/') return new Response(homePage(await sessionUser(request,registry),locale),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','content-language':locale==='en'?'en':'zh-CN'}});
    if (request.method === 'GET' && url.pathname === '/favicon.svg') return new Response(LOGO_SVG,{headers:{'content-type':'image/svg+xml','cache-control':'public,max-age=86400','x-content-type-options':'nosniff'}});
    if (request.method === 'GET' && url.pathname === '/social-card.svg') return new Response(SOCIAL_CARD_SVG,{headers:{'content-type':'image/svg+xml','cache-control':'public,max-age=86400','x-content-type-options':'nosniff'}});
    if (request.method === 'GET' && url.pathname === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account\nDisallow: /en/account\nDisallow: /login\nDisallow: /register\nDisallow: /forgot\nSitemap: ${SITE_URL}/sitemap.xml\n`,{headers:{'content-type':'text/plain;charset=utf-8','cache-control':'public,max-age=3600'}});
    if (request.method === 'GET' && url.pathname === '/sitemap.xml') return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>${SITE_URL}/</loc><xhtml:link rel="alternate" hreflang="zh-CN" href="${SITE_URL}/"/><xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}/en"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/"/></url><url><loc>${SITE_URL}/en</loc><xhtml:link rel="alternate" hreflang="zh-CN" href="${SITE_URL}/"/><xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}/en"/><xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/"/></url></urlset>`,{headers:{'content-type':'application/xml;charset=utf-8','cache-control':'public,max-age=3600'}});
    if (request.method === 'GET' && url.pathname === '/pow.js') return new Response(powScript(),{headers:{'content-type':'application/javascript;charset=utf-8','cache-control':'public,max-age=3600','x-content-type-options':'nosniff'}});
    if (request.method === 'GET' && ['/login','/register'].includes(pagePath)) {
      const notices=locale==='en'?{ 'check-email':'Account created. Check your email to verify it.','verify-first':'Verify your email before logging in.','reset-sent':'If the account exists, a reset email has been sent.','verified':'Email verified. You can now log in.','reset':'Password reset.' }:{ 'check-email':'注册成功，请查收验证邮件。','verify-first':'请先完成邮箱验证。','reset-sent':'如果账号存在，重置邮件已经发出。','verified':'邮箱验证成功，现在可以登录。','reset':'密码已重置。' };
      const message=url.searchParams.get('error')||notices[url.searchParams.get('notice')]||'';
      return new Response(authPage(pagePath.slice(1),message,locale),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
    }
    if (request.method === 'GET' && pagePath === '/forgot') return new Response(shell(locale==='en'?'Reset password':'找回密码',locale==='en'?'<main id="main" class="auth card"><h1>Reset password</h1><p class="muted">Enter your account email and we will send a reset link.</p><form method="post" action="/api/auth/forgot-password"><input type="hidden" name="locale" value="en"><label class="field">Email<input type="email" name="email" required></label><button class="full">Send reset email</button></form></main>':'<main id="main" class="auth card"><h1>找回密码</h1><p class="muted">输入注册邮箱，我们会发送重置链接。</p><form method="post" action="/api/auth/forgot-password"><label class="field">邮箱<input type="email" name="email" required></label><button class="full">发送重置邮件</button></form></main>','',null,locale),{headers:{'content-type':'text/html;charset=utf-8'}});
    if (request.method === 'GET' && pagePath === '/reset-password') { const token=(url.searchParams.get('token')||'').replace(/["&<>]/g,''); return new Response(shell(locale==='en'?'Set a new password':'设置新密码',locale==='en'?`<main id="main" class="auth card"><h1>Set a new password</h1><form method="post" action="/api/auth/reset-password"><input type="hidden" name="locale" value="en"><input type="hidden" name="token" value="${token}"><label class="field">New password<input type="password" name="password" minlength="8" required></label><button class="full">Save new password</button></form></main>`:`<main id="main" class="auth card"><h1>设置新密码</h1><form method="post" action="/api/auth/reset-password"><input type="hidden" name="token" value="${token}"><label class="field">新密码<input type="password" name="password" minlength="8" required></label><button class="full">保存新密码</button></form></main>`,'',null,locale),{headers:{'content-type':'text/html;charset=utf-8'}}); }
    if (request.method === 'GET' && pagePath === '/verify-email') { const token=(url.searchParams.get('token')||'').replace(/["&<>]/g,''); return new Response(shell(locale==='en'?'Verify email':'验证邮箱',locale==='en'?`<main id="main" class="auth card"><h1>Verify email</h1><form method="post" action="/api/auth/verify-email"><input type="hidden" name="locale" value="en"><input type="hidden" name="token" value="${token}"><button class="full">Complete verification</button></form></main>`:`<main id="main" class="auth card"><h1>验证邮箱</h1><form method="post" action="/api/auth/verify-email"><input type="hidden" name="token" value="${token}"><button class="full">完成验证</button></form></main>`,'',null,locale),{headers:{'content-type':'text/html;charset=utf-8'}}); }
    if (request.method === 'GET' && url.pathname === '/reset-password') return new Response(shell('设置新密码',`<main class="auth card"><h1>设置新密码</h1><form method="post" action="/api/auth/reset-password"><input type="hidden" name="token" value="${(url.searchParams.get('token')||'').replace(/["&<>]/g,'')}"><label class="field">新密码<input type="password" name="password" minlength="8" required></label><button class="full">保存新密码</button></form></main>`),{headers:{'content-type':'text/html;charset=utf-8'}});
    if (request.method === 'GET' && url.pathname === '/verify-email') return new Response(shell('验证邮箱',`<main class="auth card"><h1>验证邮箱</h1><form method="post" action="/api/auth/verify-email"><input type="hidden" name="token" value="${(url.searchParams.get('token')||'').replace(/["&<>]/g,'')}"><button class="full">完成验证</button></form></main>`),{headers:{'content-type':'text/html;charset=utf-8'}});
    if (request.method === 'GET' && pagePath === '/account') {
      const user=await sessionUser(request,registry); if(!user)return Response.redirect(`${origin}${locale==='en'?'/en':''}/login`,303);
      const activities=await (await registry.fetch('https://registry/activities',{headers:{'x-user-id':user.id}})).json();
      return new Response(localizeSecondaryPage(accountPage(user,activities),locale),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store'}});
    }
    if (request.method === 'GET' && ['/terms','/privacy','/legal-supplement'].includes(pagePath)) {
      const map={'/terms':['terms_of_service','服务条款'],'/privacy':['privacy_policy','隐私政策'],'/legal-supplement':['product_legal_supplement','产品补充说明']};
      const [type,zhTitle]=map[pagePath], title=locale==='en'?({'terms_of_service':'Terms of Service','privacy_policy':'Privacy Policy','product_legal_supplement':'Product Legal Supplement'}[type]):zhTitle, endpoint=type==='product_legal_supplement'?'product-supplement':'document';
      const legalLocale=locale==='en'?'en':'zh-CN', query=type==='product_legal_supplement'?`product=solodrop&locale=${legalLocale}`:`product=solodrop&type=${type}&locale=${legalLocale}`;
      try { const response=await fetch(`https://laws.szlk.ai/api/legal/${endpoint}?${query}`); if(!response.ok)throw new Error(); const payload=await response.json(); return new Response(localizeSecondaryPage(legalPage(title,payload.result||payload),locale),{headers:{'content-type':'text/html;charset=utf-8','cache-control':'public,max-age=300'}}); }
      catch { return new Response(localizeSecondaryPage(legalPage(title,null),locale),{status:503,headers:{'content-type':'text/html;charset=utf-8'}}); }
    }
    if (url.pathname.startsWith('/api/auth/') && (request.method === 'POST' || url.pathname.endsWith('/logout'))) return handleAuth(request,env,registry,origin);
    if (request.method === 'POST' && url.pathname === '/api/temp/challenge') {
      try{return json(await challenge())}catch(error){return json({error:error.message},502)}
    }
    if (request.method === 'POST' && url.pathname === '/api/temp/deploy') {
      const user=await sessionUser(request,registry);
      try{return json(await deployTemporary(request,user,registry,origin),201)}catch(error){return json({error:error.message||'生成失败。'},422)}
    }
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) return new Response(null, { status: 204, headers: corsHeaders(request) });
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, service: SERVICE_NAME });
    if (request.method === 'GET' && url.pathname === '/embed.js') {
      return new Response(renderEmbedScript(), { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' } });
    }
    const create = request.method === 'POST' && url.pathname === '/api/links';
    const match = url.pathname.match(/^\/api\/links\/([A-Za-z0-9]+)(?:\/(config|stats))?$/) || url.pathname.match(/^\/([A-Za-z0-9]+)$/);
    if (!create && !match) return json({ error: 'Not found.' }, 404);
    if (create) {
      let body;
      try { body = await request.text(); } catch { return json({ error: 'Could not read request.' }, 400); }
      if (body.length > 4096) return json({ error: 'Request body is too large.' }, 413);
      let parsed;
      try { parsed = JSON.parse(body); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
      let target;
      try { target = normalizeTarget(parsed.url); await verifyPreview(target); } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Preview validation failed.' }, 422);
      }
      const forwarded = new Request('https://registry/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-solodrop-client-ip': request.headers.get('cf-connecting-ip') || '' },
        body: JSON.stringify({
          url: target,
          title: parsed.title,
          temporary: parsed.temporary,
          expiresAt: parsed.expiresAt
        })
      });
      const response = await registry.fetch(forwarded);
      if (!response.ok) return response;
      const result = await response.json();
      return json({ ...result, shortUrl: `${url.origin}/${result.slug}` }, 201);
    }
    const slug = match[1];
    const apiAction = url.pathname.startsWith('/api/') ? match[2] : '';
    const headers = apiAction === 'stats' ? { 'x-management-token': request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '' } : undefined;
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/') && !apiAction) {
      return registry.fetch(`https://registry/links/${slug}`, {
        method: 'DELETE',
        headers: { 'x-management-token': request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '' }
      });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const resolved = await registry.fetch(`https://registry/links/${slug}${apiAction ? `/${apiAction}` : ''}`, { headers });
    if (apiAction || !resolved.ok) return resolved;
    const result = await resolved.json();
    return new Response(null, {
      status: 302,
      headers: { location: result.target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
    });
  }
};

export const workerInternals = { normalizeTarget, PLATFORM_ACTION, randomSlug, renderEmbedScript, sha256, verifyPreview, withLinkMarker };
