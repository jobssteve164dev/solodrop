import { createPassportClient } from '../vendor/passport-client.mjs';

const PRODUCT = 'solodrop';
const PUBLIC_ORIGIN = 'https://drop.szlk.ai';
const FREE_POLICY = Object.freeze({ pro:false, maxFileBytes:10*1024*1024, maxStoredBytes:null, expiryDays:[1], features:[] });

function passportClient(env) {
  if (!env.SZLK_PASSPORT_SECRET) throw new Error('账户服务暂时不可用，请稍后重试。');
  return createPassportClient({baseUrl:env.SZLK_PASSPORT_URL,product:PRODUCT,secret:env.SZLK_PASSPORT_SECRET});
}

async function billingCatalog(env) {
  const catalog=await passportClient(env).getBillingCatalog({product:PRODUCT});
  const plans=(catalog.plans || []).filter(plan=>['pro_monthly','pro_yearly'].includes(plan.metadata?.uiKey));
  if (plans.length!==2 || new Set(plans.map(plan=>plan.metadata.uiKey)).size!==2) throw new Error('套餐暂时无法加载，请稍后重试。');
  for (const plan of plans) {
    const limits=plan.metadata?.limits;
    if (!plan.planId || !Number.isInteger(plan.amountCents) || plan.amountCents<=0 || !/^[a-z]{3}$/i.test(plan.currency) || !['month','year'].includes(plan.interval)
      || !plan.featureKeys?.includes('pro_sharing') || !Number.isInteger(limits?.maxFileBytes) || limits.maxFileBytes<=0
      || !Number.isInteger(limits?.maxStoredBytes) || limits.maxStoredBytes<limits.maxFileBytes
      || !Array.isArray(limits.expiryDays) || !limits.expiryDays.length || limits.expiryDays.some(day=>![1,7,30].includes(day))) throw new Error('套餐暂时无法加载，请稍后重试。');
  }
  if(JSON.stringify(plans[0].metadata.limits)!==JSON.stringify(plans[1].metadata.limits) || JSON.stringify(plans[0].metadata.features)!==JSON.stringify(plans[1].metadata.features)) throw new Error('套餐权益暂时无法确认，请稍后重试。');
  return {product:PRODUCT,plans};
}

function publicCatalog(catalog) {
  return {plans:catalog.plans.map(plan=>({uiKey:plan.metadata.uiKey,label:plan.label,labelZh:plan.labelZh,amountCents:plan.amountCents,currency:plan.currency,interval:plan.interval,limits:plan.metadata.limits,features:plan.metadata.features||[]}))};
}

async function sharePolicy(env,user) {
  if(!user) return FREE_POLICY;
  const access=await passportClient(env).checkAccess({product:PRODUCT,featureKey:'pro_sharing',userId:user.id,email:user.email});
  if(access.allowed!==true) return FREE_POLICY;
  const {plans}=await billingCatalog(env);
  return {pro:true,...plans[0].metadata.limits,features:plans[0].metadata.features||[]};
}

function sameOrigin(request) {
  const origin=request.headers.get('origin');
  return !origin || origin===new URL(request.url).origin;
}

async function checkout(env,user,body) {
  const {plans}=await billingCatalog(env);
  const plan=plans.find(plan=>plan.metadata.uiKey===body.uiKey);
  if(!plan) return null;
  const prefix=body.locale==='en'?'/en':'';
  const result=await passportClient(env).createCheckoutLink({product:PRODUCT,planId:plan.planId,email:user.email,userId:user.id,clientReferenceId:user.id,successUrl:`${PUBLIC_ORIGIN}${prefix}/billing/success`,cancelUrl:`${PUBLIC_ORIGIN}${prefix}/pricing`});
  const url=new URL(result.checkout?.url);
  if(url.protocol!=='https:' || url.username || url.password) throw new Error('无法打开付款页面，请稍后重试。');
  return {url:url.href};
}

async function billingPortal(env,user,locale) {
  const result=await passportClient(env).getBillingPortalLink({product:PRODUCT,email:user.email,userId:user.id,returnUrl:`${PUBLIC_ORIGIN}${locale==='en'?'/en':''}/account`});
  if(!result.portal?.url) throw new Error('暂时无法打开订阅管理，请稍后重试。');
  const url=new URL(result.portal.url);
  if(url.protocol!=='https:')throw new Error('暂时无法打开订阅管理，请稍后重试。');
  return {url:url.href};
}

export { passportClient, billingCatalog, publicCatalog, sharePolicy, FREE_POLICY, checkout, billingPortal, sameOrigin };
