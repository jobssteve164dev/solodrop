const SESSION_COOKIE = 'solodrop_session';
const PASSPORT_URL = 'https://passport.szlk.ai';

function parseCookie(request, name) {
  const value = request.headers.get('cookie')?.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : '';
}

function formBody(request) {
  return request.formData().then((form) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])));
}

async function passport(env, path, body) {
  if (!env.SZLK_PASSPORT_SECRET) throw new Error('Account service is not configured.');
  const response = await fetch(`${env.SZLK_PASSPORT_URL || PASSPORT_URL}${path}`, {
    method: 'POST', headers: {'content-type':'application/json','x-szlk-product':'solodrop','x-szlk-secret':env.SZLK_PASSPORT_SECRET}, body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error?.message || payload.message || 'Account request failed.');
  return payload.data || payload.result || payload;
}

async function sessionUser(request, registry) {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const response = await registry.fetch('https://registry/session', {headers:{'x-session-token':token}});
  return response.ok ? response.json() : null;
}

async function establishSession(user, registry) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await registry.fetch('https://registry/session', {method:'POST',headers:{'content-type':'application/json','x-session-token':token},body:JSON.stringify(user)});
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

async function handleAuth(request, env, registry, origin) {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/logout') {
    const token = parseCookie(request, SESSION_COOKIE);
    if (token) await registry.fetch('https://registry/session', {method:'DELETE',headers:{'x-session-token':token}});
    return new Response(null,{status:303,headers:{location:url.searchParams.get('locale')==='en'?'/en':'/', 'set-cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});
  }
  const mode = url.pathname.split('/').pop();
  const body = await formBody(request);
  const prefix=body.locale==='en'?'/en':'';
  delete body.locale;
  try {
    if (mode === 'register') {
      const data = await passport(env, '/api/v1/auth/register', {...body,appBaseUrl:origin});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=check-email`}});
    }
    if (mode === 'login') {
      const data = await passport(env, '/api/v1/auth/login', body);
      if (data.needsEmailVerification || data.user?.emailVerified === false) return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=verify-first`}});
      const cookie = await establishSession(data.user, registry);
      return new Response(null,{status:303,headers:{location:prefix||'/', 'set-cookie':cookie}});
    }
    if (mode === 'forgot-password') {
      await passport(env, '/api/v1/auth/forgot-password', {email:body.email,appBaseUrl:origin});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=reset-sent`}});
    }
    if (mode === 'verify-email') {
      await passport(env, '/api/v1/auth/verify-email', {token:body.token});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=verified`}});
    }
    if (mode === 'reset-password') {
      await passport(env, '/api/v1/auth/reset-password', {token:body.token,password:body.password});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=reset`}});
    }
    throw new Error('Unsupported account action.');
  } catch (error) {
    return new Response(null,{status:303,headers:{location:`${prefix}/${mode === 'register' ? 'register' : 'login'}?error=${encodeURIComponent(error.message)}`}});
  }
}

export { handleAuth, passport, sessionUser };
