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
  label: 'Share your own preview',
  url: 'https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop'
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
  return `(function(){try{var s=new URL(location.href).searchParams.get('sd');var slot=document.querySelector('[data-solodrop-actions]');if(!s||!slot)return;fetch('https://drop.szlk.ai/api/links/'+encodeURIComponent(s)+'/config',{mode:'cors'}).then(function(r){if(!r.ok)throw new Error();return r.json()}).then(function(d){var f=document.createDocumentFragment();if(d.action){var a=document.createElement('a');a.className='solodrop-cta';a.href=d.action.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=d.action.label;f.appendChild(a)}var b=document.createElement('a');b.className='solodrop-powered';b.href='https://marketplace.visualstudio.com/items?itemName=SZLK.solodrop';b.target='_blank';b.rel='noopener noreferrer';b.textContent='Shared with SoloDrop';f.appendChild(b);slot.replaceChildren(f);slot.hidden=false}).catch(function(){slot.hidden=true})}catch(e){}})();`;
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
    );`);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/create') return this.create(request);
    const match = url.pathname.match(/^\/links\/([A-Za-z0-9]+)(?:\/(config|stats))?$/);
    if (request.method === 'GET' && match) {
      if (match[2] === 'stats') return this.stats(match[1], request.headers.get('x-management-token') || '');
      return this.read(match[1], match[2] === 'config');
    }
    if (request.method === 'DELETE' && match && !match[2]) return this.remove(match[1], request.headers.get('x-management-token') || '');
    return json({ error: 'Not found.' }, 404);
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
      const response = await env.LINKS.get(env.LINKS.idFromName('registry')).fetch(forwarded);
      if (!response.ok) return response;
      const result = await response.json();
      return json({ ...result, shortUrl: `${url.origin}/${result.slug}` }, 201);
    }
    const slug = match[1];
    const apiAction = url.pathname.startsWith('/api/') ? match[2] : '';
    const headers = apiAction === 'stats' ? { 'x-management-token': request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '' } : undefined;
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/') && !apiAction) {
      return env.LINKS.get(env.LINKS.idFromName('registry')).fetch(`https://registry/links/${slug}`, {
        method: 'DELETE',
        headers: { 'x-management-token': request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '' }
      });
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const resolved = await env.LINKS.get(env.LINKS.idFromName('registry')).fetch(`https://registry/links/${slug}${apiAction ? `/${apiAction}` : ''}`, { headers });
    if (apiAction || !resolved.ok) return resolved;
    const result = await resolved.json();
    return new Response(null, {
      status: 302,
      headers: { location: result.target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
    });
  }
};

export const workerInternals = { normalizeTarget, PLATFORM_ACTION, randomSlug, renderEmbedScript, sha256, verifyPreview, withLinkMarker };
