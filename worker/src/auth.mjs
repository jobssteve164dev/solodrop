import { passportClient, sameOrigin } from './billing.mjs';
const SESSION_COOKIE = 'solodrop_session';
const ACTIVITY_CLAIM_COOKIE = 'solodrop_activity_claim';

function parseCookie(request, name) {
  const value = request.headers.get('cookie')?.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : '';
}

function formBody(request) {
  return request.formData().then((form) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])));
}

async function passport(env, path, body) {
  const methods={'/api/v1/auth/register':'registerWithPassword','/api/v1/auth/login':'loginWithPassword','/api/v1/passport/link':'linkIdentity','/api/v1/auth/forgot-password':'forgotPassword','/api/v1/auth/verify-email':'verifyEmailToken','/api/v1/auth/reset-password':'resetPassword'};
  if(!methods[path])throw new Error('Unsupported account action.');
  return passportClient(env)[methods[path]](body);
}

async function sessionUser(request, registry) {
  const token = sessionToken(request);
  if (!token) return null;
  const response = await registry.fetch('https://registry/session', {headers:{'x-session-token':token}});
  return response.ok ? response.json() : null;
}

async function establishSession(user, registry) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const response=await registry.fetch('https://registry/session', {method:'POST',headers:{'content-type':'application/json','x-session-token':token},body:JSON.stringify(user)});
  if(!response.ok)throw new Error('Could not start your session. Please try again.');
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

async function handleAuth(request, env, registry, origin) {
  const url = new URL(request.url);
  if(!sameOrigin(request))return new Response('Invalid request origin.',{status:403});
  origin='https://drop.szlk.ai';
  if (url.pathname === '/api/auth/logout') {
    const token = sessionToken(request);
    if (token) await registry.fetch('https://registry/session', {method:'DELETE',headers:{'x-session-token':token}});
    return new Response(null,{status:303,headers:{location:url.searchParams.get('locale')==='en'?'/en':'/', 'set-cookie':`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}});
  }
  const mode = url.pathname.split('/').pop();
  const body = await formBody(request);
  const prefix=body.locale==='en'?'/en':'';
  const next=safeNext(body.next)||safeNext(parseCookie(request,'solodrop_auth_next'));
  const nextQuery=next?'&next='+encodeURIComponent(next):'';
  const nextCookie=next?`solodrop_auth_next=${encodeURIComponent(next)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`:'';
  delete body.locale;
  delete body.next;
  try {
    if (mode === 'register') {
      const data = await passport(env, '/api/v1/auth/register', {...body,appBaseUrl:origin});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=check-email${nextQuery}`,...(next?{'set-cookie':`solodrop_auth_next=${encodeURIComponent(next)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`}:{})}});
    }
    if (mode === 'login') {
      const data = await passport(env, '/api/v1/auth/login', body);
      if (data.needsEmailVerification || data.user?.emailVerified === false) return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=verify-first${nextQuery}`,...(nextCookie?{'set-cookie':nextCookie}:{})}});
      await passport(env, '/api/v1/passport/link', {
        email:data.user?.email,
        product:'solodrop',
        productUid:data.user?.id,
        metadata:{integration:'solodrop_headless_auth'}
      });
      await passportClient(env).checkAccess({product:'solodrop',featureKey:'pro_sharing',userId:data.user.id,email:data.user.email});
      const cookie = await establishSession(data.user, registry);
      const claimToken=parseCookie(request,ACTIVITY_CLAIM_COOKIE);
      let claimed=0, claimCompleted=false;
      if(claimToken){
        const response=await registry.fetch('https://registry/claim-activities',{method:'POST',headers:{'content-type':'application/json','x-claim-token':claimToken},body:JSON.stringify({userId:data.user.id,email:data.user.email})});
        if(response.ok){claimed=(await response.json()).claimed||0;claimCompleted=true;}
      }
      const headers=new Headers({location:next || (claimed?`${prefix}/account`:(prefix||'/'))});
      headers.append('set-cookie',cookie);
      if(next)headers.append('set-cookie','solodrop_auth_next=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
      if(claimCompleted)headers.append('set-cookie',`${ACTIVITY_CLAIM_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
      return new Response(null,{status:303,headers});
    }
    if (mode === 'forgot-password') {
      await passport(env, '/api/v1/auth/forgot-password', {email:body.email,appBaseUrl:origin});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=reset-sent`}});
    }
    if (mode === 'verify-email') {
      const data = await passport(env, '/api/v1/auth/verify-email', {token:body.token});
      await passport(env, '/api/v1/passport/link', {
        email:data.user?.email,
        product:'solodrop',
        productUid:data.user?.id,
        metadata:{integration:'solodrop_headless_auth'}
      });
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=verified${nextQuery}`}});
    }
    if (mode === 'reset-password') {
      await passport(env, '/api/v1/auth/reset-password', {token:body.token,password:body.password});
      return new Response(null,{status:303,headers:{location:`${prefix}/login?notice=reset`}});
    }
    throw new Error('Unsupported account action.');
  } catch (error) {
    return new Response(null,{status:303,headers:{location:`${prefix}/${mode === 'register' ? 'register' : 'login'}?error=${encodeURIComponent(error.message)}${next?'&next='+encodeURIComponent(next):''}`}});
  }
}

function sessionToken(request) { return request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9-]+)$/)?.[1] || parseCookie(request,SESSION_COOKIE); }
function safeNext(value) { return typeof value==='string' && /^\/(?:en\/)?(?:pricing|connect)(?:\?code=[A-Za-z0-9-]+)?$/.test(value)?value:''; }
export { handleAuth, passport, sessionUser, sessionToken, safeNext };
