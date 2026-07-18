import { MAX_FILE_BYTES } from './web.mjs';

const API = 'https://api.cloudflare.com/client/v4';

async function cfJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.errors?.[0]?.message || `Cloudflare request failed (${response.status}).`);
  return body.result;
}

function safeName(name) { return String(name || 'shared-file').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,120) || 'shared-file'; }
function js(value) { return JSON.stringify(value).replace(/</g,'\\u003c'); }

function previewWorker(name, type, bytes) {
  let binary = ''; for (let i=0;i<bytes.length;i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
  const data = btoa(binary), title = safeName(name);
  return `const n=${js(title)},t=${js(type || 'application/octet-stream')},d=${js(data)};function bytes(){return Uint8Array.from(atob(d),c=>c.charCodeAt(0))}export default{fetch(r){let u=new URL(r.url);if(u.pathname==='/file')return new Response(bytes(),{headers:{'content-type':t,'content-disposition':'inline; filename="'+encodeURIComponent(n)+'"','x-content-type-options':'nosniff'}});let media=t.startsWith('image/')?'<img style="max-width:100%;height:auto" src="/file" alt="">':t==='application/pdf'?'<embed src="/file" type="application/pdf" style="width:100%;height:78vh">':t.startsWith('text/')||/json|javascript|xml/.test(t)?'<pre id="p"></pre><script>fetch("/file").then(r=>r.text()).then(x=>p.textContent=x)<\\/script>':'<p><a href="/file">下载文件</a></p>';return new Response('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="solodrop-preview" content="web-v1"><title>'+n+'</title><style>body{margin:0;font:16px system-ui;background:#f6f6fa;color:#20202b}header,main,aside{width:min(100% - 32px,960px);margin:auto}header{padding:22px 0;font-weight:750}main{background:white;border:1px solid #dddde8;border-radius:16px;padding:24px;min-height:55vh;overflow:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}aside{padding:20px 0 40px}</style></head><body><header>'+n+' · SoloDrop</header><main>'+media+'</main><aside data-solodrop-actions hidden></aside><script defer src="https://drop.szlk.ai/embed.js"><\\/script></body></html>',{headers:{'content-type':'text/html;charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' https://drop.szlk.ai 'unsafe-inline'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'none'",'x-content-type-options':'nosniff'}})}}`;
}

async function challenge() {
  const result = await cfJson(`${API}/provisioning/previews/challenge`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if (!result.challengeToken || !result.seed || !Number.isInteger(result.k) || !Number.isInteger(result.g) || result.k * result.g > 64000000) throw new Error('Cloudflare returned an unsupported challenge.');
  return result;
}

async function deployTemporary(request, user, registry, origin) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) throw new Error('第一版仅支持 1 MB 以内的文件。');
  if (form.get('accepted') !== 'yes') throw new Error('请先同意 Cloudflare 条款与隐私政策。');
  const checkpoints = String(form.get('checkpoints') || ''), challengeToken = String(form.get('challengeToken') || '');
  if (!challengeToken || !checkpoints || checkpoints.length > 500000) throw new Error('Cloudflare 安全校验结果无效。');
  const activityId = crypto.randomUUID();
  await registry.fetch('https://registry/activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:activityId,userId:user.id,email:user.email,fileName:safeName(file.name),sizeBytes:file.size,contentType:file.type,status:'provisioning'})});
  try {
    const temporary = await cfJson(`${API}/provisioning/previews`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({termsOfService:'https://www.cloudflare.com/terms/',privacyPolicy:'https://www.cloudflare.com/privacypolicy/',acceptTermsOfService:'yes',challengeToken,solution:{checkpoints}})});
    const account = temporary.account, claim = temporary.claim;
    if (!account?.id || !account?.apiToken || !claim?.url || !claim?.expiresAt) throw new Error('Cloudflare temporary account response was incomplete.');
    const scriptName = `solodrop-${crypto.randomUUID().slice(0,8)}`, source = previewWorker(file.name,file.type,new Uint8Array(await file.arrayBuffer()));
    const upload = new FormData();
    upload.set('metadata',new Blob([JSON.stringify({main_module:'worker.mjs',compatibility_date:'2026-07-18'})],{type:'application/json'}));
    upload.set('worker.mjs',new Blob([source],{type:'application/javascript+module'}),'worker.mjs');
    const headers = {authorization:`Bearer ${account.apiToken}`};
    await cfJson(`${API}/accounts/${account.id}/workers/scripts/${scriptName}`,{method:'PUT',headers,body:upload});
    const sub = await cfJson(`${API}/accounts/${account.id}/workers/subdomain`,{headers});
    const previewUrl = `https://${scriptName}.${sub.subdomain}.workers.dev`;
    let live = false; for (let i=0;i<6;i++){const response=await fetch(previewUrl);if(response.ok&&(await response.text()).includes('solodrop-preview')){live=true;break}await new Promise((r)=>setTimeout(r,1000));}
    if (!live) throw new Error('分享页已部署，但上线检查未通过。');
    const created = await registry.fetch('https://registry/create',{method:'POST',headers:{'content-type':'application/json','x-solodrop-client-ip':request.headers.get('cf-connecting-ip')||''},body:JSON.stringify({url:previewUrl,title:file.name,temporary:true,expiresAt:claim.expiresAt})});
    if (!created.ok) throw new Error((await created.json()).error || '短链接创建失败。');
    const link = await created.json();
    await registry.fetch(`https://registry/activity/${activityId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'ready',shortSlug:link.slug,previewUrl,expiresAt:claim.expiresAt})});
    return {shortUrl:`${origin}/${link.slug}`,previewUrl,claimUrl:claim.url,expiresAt:claim.expiresAt};
  } catch (error) {
    await registry.fetch(`https://registry/activity/${activityId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'failed'})});
    throw error;
  }
}

export { challenge, deployTemporary, previewWorker };
