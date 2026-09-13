import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/src/index.mjs';
import { createShare, serveShare, serveContent } from '../worker/src/shares.mjs';

const limits = { maxFileBytes: 104857600, maxStoredBytes: 5368709120, expiryDays: [1,7,30] };
const plans = ['month','year'].map((interval) => ({planId:`solodrop_pro_${interval}ly`,label:'SoloDrop Pro',interval,currency:'usd',amountCents:interval==='month'?500:4900,featureKeys:['pro_sharing'],metadata:{uiKey:`pro_${interval}ly`,limits,features:['password','remove_branding']}}));
const user = {id:'user-1',email:'member@example.com',name:'Member'};
function fixture() {
  const objects = new Map();
  const registryCalls = [];
  const registry = {async fetch(url, options={}) {
    const req = url instanceof Request ? url : new Request(url, options);
    registryCalls.push(req);
    if(new URL(req.url).pathname==='/session') return Response.json(user);
    return Response.json({ok:true});
  }};
  const env = {SZLK_PASSPORT_SECRET:'fixture-only',LINKS:{idFromName:()=> 'registry',get:()=>registry},PREVIEWS:{
    async head(key){return objects.has(key)?{}:null;},
    async put(key,value,options={}){objects.set(key,{bytes:new Uint8Array(await new Response(value).arrayBuffer()),type:options.httpMetadata?.contentType||'application/octet-stream'});},
    async get(key){const item=objects.get(key);return item?{body:item.bytes,size:item.bytes.length,httpEtag:'"test"',async json(){return JSON.parse(new TextDecoder().decode(item.bytes));},writeHttpMetadata(headers){headers.set('content-type',item.type);}}:null;},
    async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}
  }};
  return {env,objects,registry,registryCalls};
}
function upload(expiry, extra={}) {
  const form = new FormData(); form.set('file',new File(['# Review'],'review.md',{type:'text/markdown'})); form.set('expiry',expiry);
  for(const [key,value]of Object.entries(extra))form.set(key,value);
  return new Request('https://drop.szlk.ai/api/shares',{method:'POST',body:form});
}
async function upstream(allowed, run) {
  const previous=globalThis.fetch, calls=[];
  globalThis.fetch=async(input,init={})=>{
    const url=new URL(input); calls.push({url,init});
    if(url.pathname==='/api/v1/billing/catalog') return Response.json({ok:true,data:{product:'solodrop',plans}});
    if(url.pathname==='/api/v1/entitlements/access-check') return Response.json({ok:true,data:{allowed,userId:user.id,email:user.email}});
    if(url.pathname==='/api/v1/billing/checkout-link') return Response.json({ok:true,data:{checkout:{url:'https://checkout.stripe.com/c/pay/test'}}});
    throw new Error(`Unexpected upstream ${url.pathname}`);
  };
  try { await run(calls); } finally { globalThis.fetch=previous; }
}

test('rejects unlimited retention even for an authenticated paid user before storing a file',async()=>{
  const f=fixture();
  await upstream(true,async()=>{
    await assert.rejects(()=>createShare(upload('never'),f.env,user,f.registry,'https://drop.szlk.ai'),/有效期|lifetime/i);
    assert.equal(f.objects.size,0);
  });
});

test('a free signed-in account cannot create a seven-day share',async()=>{
  const f=fixture();
  await upstream(false,async()=>{
    await assert.rejects(()=>createShare(upload('week'),f.env,user,f.registry,'https://drop.szlk.ai'),/Pro|24|1 天/);
    assert.equal(f.objects.size,0);
  });
});

test('Pro access uses the authenticated identity and produces a finite thirty-day share',async()=>{
  const f=fixture();
  await upstream(true,async(calls)=>{
    const result=await createShare(upload('month'),f.env,user,f.registry,'https://drop.szlk.ai');
    assert.ok(Date.parse(result.expiresAt)>Date.now()+29*86400000);
    assert.ok(Date.parse(result.expiresAt)<=Date.now()+30*86400000);
    const call=calls.find(c=>c.url.pathname.endsWith('/access-check'));
    assert.ok(call,'a local login must not grant Pro without Passport');
    assert.equal(JSON.parse(call.init.body).userId,'user-1');
  });
});

test('protected shares block both the preview and the original bytes without the password',async()=>{
  const f=fixture();
  await upstream(true,async()=>{
    const result=await createShare(upload('day',{password:'client-review',removeBranding:'yes'}),f.env,user,f.registry,'https://drop.szlk.ai');
    const slug=new URL(result.shortUrl).pathname.slice(1);
    const page=await serveShare(slug,f.env,new Request(result.shortUrl));
    assert.equal(page.status,401);
    assert.equal(page.headers.get('referrer-policy'),'same-origin');
    const content=await serveContent(new Request(`https://drop.szlk.ai/api/shares/${slug}/content?download=1`),slug,f.env);
    assert.equal(content.status,401);
    assert.ok(!new TextDecoder().decode(f.objects.get(`shares/${slug}.json`).bytes).includes('client-review'));
  });
});

test('pricing catalog is read from Passport without exposing provider identifiers',async()=>{
  await upstream(false,async()=>{
    const response=await worker.fetch(new Request('https://drop.szlk.ai/api/billing/catalog'),fixture().env);
    assert.equal(response.status,200);
    const data=await response.json();
    assert.deepEqual(data.plans.map(p=>p.amountCents),[500,4900]);
    assert.equal(data.plans[0].uiKey,'pro_monthly');
    assert.equal(data.plans[0].priceKey,undefined);
  });
});

test('checkout rejects guests and unknown plans without an upstream payment side effect',async()=>{
  await upstream(false,async(calls)=>{
    const request=(body,auth=false)=>new Request('https://drop.szlk.ai/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://drop.szlk.ai',...(auth?{cookie:'solodrop_session=test'}:{})},body:JSON.stringify(body)});
    assert.equal((await worker.fetch(request({uiKey:'pro_monthly'}),fixture().env)).status,401);
    assert.equal((await worker.fetch(request({uiKey:'unknown'},true),fixture().env)).status,400);
    assert.ok(!calls.some(c=>c.url.pathname.endsWith('/checkout-link')));
  });
});

test('checkout ignores caller supplied identity and amount and uses canonical public return URLs',async()=>{
  await upstream(false,async(calls)=>{
    const response=await worker.fetch(new Request('https://drop.szlk.ai/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json',origin:'https://drop.szlk.ai',cookie:'solodrop_session=test'},body:JSON.stringify({uiKey:'pro_yearly',userId:'victim',email:'victim@example.com',amount:1,successUrl:'https://evil.example',locale:'en'})}),fixture().env);
    assert.equal(response.status,200);
    const payload=JSON.parse(calls.find(c=>c.url.pathname.endsWith('/checkout-link')).init.body);
    assert.equal(payload.userId,'user-1');
    assert.equal(payload.email,'member@example.com');
    assert.equal(payload.amount,undefined);
    assert.equal(payload.successUrl,'https://drop.szlk.ai/en/billing/success');
  });
});

test('a payment return cannot grant Pro before Passport confirms access',async()=>{
  await upstream(false,async()=>{
    const response=await worker.fetch(new Request('https://drop.szlk.ai/api/account',{headers:{cookie:'solodrop_session=test'}}),fixture().env);
    assert.equal(response.status,200);
    assert.equal((await response.json()).pro,false);
  });
});

test('a correct share password opens content while an incorrect password leaves it protected',async()=>{
  const f=fixture();
  await upstream(true,async()=>{
    const created=await createShare(upload('day',{password:'client-review'}),f.env,user,f.registry,'https://drop.szlk.ai');
    const slug=new URL(created.shortUrl).pathname.slice(1);
    const unlock=async(password)=>{const body=new URLSearchParams({password});return worker.fetch(new Request(`https://drop.szlk.ai/api/shares/${slug}/unlock`,{method:'POST',headers:{origin:'https://drop.szlk.ai'},body}),f.env);};
    assert.equal((await unlock('incorrect')).status,401);
    const valid=await unlock('client-review'); assert.equal(valid.status,303);
    const cookie=valid.headers.get('set-cookie'); assert.ok(cookie.includes('HttpOnly'));
    const content=await serveContent(new Request(`https://drop.szlk.ai/api/shares/${slug}/content`,{headers:{cookie:cookie.split(';')[0]}}),slug,f.env);
    assert.equal(content.status,200); assert.equal(await content.text(),'# Review');
  });
});

test('paid brand removal removes both the mark and the remote promotion embed',async()=>{
  const f=fixture();
  await upstream(true,async()=>{
    const created=await createShare(upload('day',{removeBranding:'yes'}),f.env,user,f.registry,'https://drop.szlk.ai');
    const page=await serveShare(new URL(created.shortUrl).pathname.slice(1),f.env);
    const html=await page.text();
    assert.ok(!html.includes('class="mark"'));
    assert.ok(!html.includes('src="/embed.js'));
    assert.ok(html.includes('review.md'));
  });
});

test('website shows free retention for a logged-in free account and finite paid choices for Pro',async()=>{
  for(const pro of [false,true])await upstream(pro,async()=>{
    const response=await worker.fetch(new Request('https://drop.szlk.ai/',{headers:{cookie:'solodrop_session=test'}}),fixture().env);
    const html=await response.text();
    assert.ok(!html.includes('value="never"'));
    assert.equal(html.includes('value="week"'),pro);
    assert.equal(html.includes('id="share-password"'),pro);
  });
});

test('pricing renders authoritative monthly and annual amounts and a signed-in purchase action',async()=>{
  await upstream(false,async()=>{
    const response=await worker.fetch(new Request('https://drop.szlk.ai/en/pricing',{headers:{cookie:'solodrop_session=test'}}),fixture().env);
    assert.equal(response.status,200);
    const html=await response.text();
    assert.match(html,/\$5/);assert.match(html,/\$49/);
    assert.match(html,/data-plan="pro_yearly"/);
    assert.ok(!/[\u4e00-\u9fff]/.test(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/>中</g,'><')));
  });
});

test('English share failures identify password restrictions and revoked retention',async()=>{
  await upstream(false,async()=>{
    for(const [expiry,extra,expected]of [['day',{password:'review-password'},/Password protection requires/],['month',{},/Free links last 24 hours/]]){
      const f=fixture();await assert.rejects(()=>createShare(upload(expiry,{...extra,locale:'en'}),f.env,user,f.registry,'https://drop.szlk.ai'),expected);
    }
  });
  await upstream(true,async()=>{const f=fixture();await assert.rejects(()=>createShare(upload('day',{password:'short',locale:'en'}),f.env,user,f.registry,'https://drop.szlk.ai'),/8–128 characters/);});
});
