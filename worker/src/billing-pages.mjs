import { shell } from './web.mjs';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function billingScript(locale) {
  return `<script>const en=${locale==='en'};document.querySelectorAll('[data-plan],[data-portal]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;const status=document.getElementById('billing-status');status.textContent=en?'Opening…':'正在打开…';try{const response=await fetch(button.hasAttribute('data-portal')?'/api/billing/portal':'/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({uiKey:button.dataset.plan,locale:en?'en':'zh'})});const data=await response.json();if(!response.ok)throw Error(en?'Could not open billing. Please try again.':data.error);location.assign(data.url)}catch(error){status.textContent=error.message;button.disabled=false}}));</script>`;
}

function pricingPage(catalog,user,locale='zh',pro=false) {
  const en=locale==='en',prefix=en?'/en':'';
  const plans=catalog?.plans || [];
  const paid=plans.map(plan=>{
    const annual=plan.interval==='year',limits=plan.metadata.limits;
    const amount=new Intl.NumberFormat(en?'en-US':'zh-CN',{style:'currency',currency:plan.currency,maximumFractionDigits:2}).format(plan.amountCents/100);
    const lifetime=limits.expiryDays.join(' / ');
    return `<article class="plan card"><p class="eyebrow">Pro · ${en?(annual?'Yearly':'Monthly'):(annual?'年付':'月付')}</p><h2>${escape(amount)}<small> / ${en?(annual?'year':'month'):(annual?'年':'月')}</small></h2><p class="muted">${en?(annual?'Billed once a year.':'Billed monthly.'):(annual?'每年一次收取，可随时取消续费。':'按月收取，可随时取消续费。')}</p><ul><li>${en?'Link lifetime: ':'链接有效期：'}${lifetime} ${en?'days':'天'}</li><li>${limits.maxFileBytes/1048576} MB ${en?'per file':'单文件'}</li><li>${limits.maxStoredBytes/1073741824} GB ${en?'of active shares':'有效分享内容'}</li><li>${en?'Password protection':'访问密码'}</li><li>${en?'Remove SoloDrop branding':'移除 SoloDrop 品牌'}</li></ul>${pro?`<button class="full" data-portal>${en?'Manage subscription':'管理订阅'}</button>`:user?`<button class="full" data-plan="${escape(plan.metadata.uiKey)}">${en?'Get Pro':'升级 Pro'}</button>`:`<a class="button full" href="${prefix}/login?next=${encodeURIComponent(prefix+'/pricing')}">${en?'Log in to get Pro':'登录并升级 Pro'}</a>`}</article>`;
  }).join('');
  const body=`<main id="main" class="page pricing"><div class="section-head"><p class="eyebrow">SoloDrop</p><h1>${en?'Share now. Give it the time it needs.':'随手分享，留出恰好的时间。'}</h1><p>${en?'Start free without an account. Pro gives your reviews and deliveries more time and control.':'免登录即可免费分享。需要更长的审阅时间或更私密的交付时，再选择 Pro。'}</p></div><div class="plans"><article class="plan card"><p class="eyebrow">Free</p><h2>${en?'Free':'免费'}</h2><p class="muted">${en?'No account needed.':'无需登录，直接使用。'}</p><ul><li>${en?'24-hour links':'链接保留 24 小时'}</li><li>10 MB ${en?'per file':'单文件'}</li><li>${en?'Browser previews':'浏览器在线预览'}</li><li>${en?'Download controls and text watermarks':'下载控制与文字水印'}</li></ul><a class="button secondary full" href="${prefix||'/'}">${en?'Share a file':'立即分享文件'}</a></article>${paid}</div>${!catalog?`<p role="alert">${en?'Plans could not be loaded. Please refresh to try again.':'套餐暂时无法加载，请刷新重试。'}</p>`:''}<p id="billing-status" role="status" aria-live="polite"></p><p class="muted">${en?'Monthly and yearly Pro have the same features. Links expire within 30 days. Canceling renewal keeps your subscription active until the end of its paid period.':'Pro 月付与年付权益相同，分享最长保留 30 天。取消续费后，订阅权益保留至已付周期结束。'}</p></main><style>.pricing{padding:64px 0 88px}.pricing h1{font-size:clamp(30px,4vw,46px);letter-spacing:-.035em}.plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:36px 0 22px}.plan{padding:28px;display:flex;flex-direction:column}.plan h2{font-size:36px;margin:4px 0 8px}.plan h2 small{font-size:16px;font-weight:500;color:var(--muted)}.plan ul{padding-left:20px;line-height:2;flex:1;margin:20px 0 28px}.plan .full{text-align:center;justify-content:center}.plan:not(:first-child){border-color:#c5c1ff;background:#fcfbff}@media(max-width:800px){.plans{grid-template-columns:1fr}.pricing{padding-top:32px}}</style>`;
  return shell(en?'Pricing':'价格',body,billingScript(locale),user,locale);
}

function subscriptionPanel(policy,locale='zh') {
  const en=locale==='en',prefix=en?'/en':'';
  return `<section class="card" style="padding:24px;margin:24px 0"><h2>${policy?.pro?'SoloDrop Pro':'SoloDrop Free'}</h2><p>${policy?.pro?(en?'Your Pro sharing options are available on the website and in VS Code.':'官网与 VS Code 插件均可使用你的 Pro 分享权益。'):(en?'Your free links last 24 hours.':'你的免费分享保留 24 小时。')}</p>${policy?.pro?`<button data-portal>${en?'Manage subscription':'管理订阅'}</button>`:`<a class="button" href="${prefix}/pricing">${en?'Explore Pro':'了解 Pro'}</a>`}<p id="billing-status" role="status" aria-live="polite"></p></section>`;
}

function billingSuccessPage(user,locale='zh') {
  const en=locale==='en',prefix=en?'/en':'';
  return shell(en?'Confirming your subscription':'确认订阅',`<main id="main" class="auth card"><h1>${en?'One moment…':'正在确认订阅'}</h1><p id="confirmation" role="status" aria-live="polite">${en?'Checking your payment. You can refresh this page if you have just finished checkout.':'正在确认付款结果。刚完成付款时可能需要稍等片刻。'}</p><button id="check-again">${en?'Check again':'重新确认'}</button><p><a href="${prefix||'/'}">${en?'Continue sharing':'继续分享'}</a></p></main>`,`<script>const en=${en};const check=async()=>{const button=document.getElementById('check-again');button.disabled=true;try{const response=await fetch('/api/account',{cache:'no-store'});const data=await response.json();document.getElementById('confirmation').textContent=response.ok&&data.pro?(en?'Pro is ready. You can now use your new sharing options.':'Pro 已生效，现在可以使用新的分享选项。'):(en?'Payment is still being confirmed. Please check again in a moment.':'付款结果仍在确认中，请稍后重试。')}catch{document.getElementById('confirmation').textContent=en?'Could not check your subscription. Please try again.':'暂时无法确认订阅，请重试。'}finally{button.disabled=false}};document.getElementById('check-again').onclick=check;check();</script>`,user,locale);
}

export { pricingPage, subscriptionPanel, billingScript, billingSuccessPage };
