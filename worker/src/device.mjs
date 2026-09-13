import { shell } from './web.mjs';

const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');

async function deviceRequest(sql,request) {
  const path=new URL(request.url).pathname,body=await request.json(),now=Date.now();
  if(path==='/device/start') {
    const code=crypto.randomUUID(),secret=crypto.randomUUID()+crypto.randomUUID(),secretHash=await hash(secret),expiresAt=now+600000;
    sql.exec('DELETE FROM device_codes WHERE expires_at < ?',now);
    sql.exec('INSERT INTO device_codes (code,secret_hash,expires_at) VALUES (?,?,?)',code,secretHash,expiresAt);
    return json({code,secret,expiresAt},201);
  }
  // Hash before reading state so no asynchronous gap can allow two redemptions.
  const secretHash=await hash(String(body.secret||''));
  const row=[...sql.exec('SELECT * FROM device_codes WHERE code = ?',String(body.code||''))][0];
  if(!row || row.expires_at<=now || row.consumed)return json({error:'Authorization expired. Please start again.'},410);
  if(path==='/device/approve') {
    if(row.user_id)return json({error:'This request has already been approved.'},409);
    if(!body.user?.id || !body.user.email)return json({error:'Unauthorized.'},401);
    sql.exec('UPDATE device_codes SET user_id = ?,email = ?,name = ? WHERE code = ?',body.user.id,body.user.email,body.user.name||'',body.code);
    return json({ok:true});
  }
  if(path!=='/device/poll')return json({error:'Not found.'},404);
  if(secretHash!==row.secret_hash)return json({error:'Invalid authorization.'},403);
  if(!row.user_id)return json({pending:true},202);
  // The token's hash is derived before a second state read to serialize redemption with session creation.
  const token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await hash(token);
  const current=[...sql.exec('SELECT consumed,expires_at FROM device_codes WHERE code = ?',body.code)][0];
  if(!current || current.consumed || current.expires_at<=Date.now())return json({error:'Authorization expired.'},410);
  sql.exec('UPDATE device_codes SET consumed = 1 WHERE code = ?',body.code);
  sql.exec('INSERT INTO sessions (token_hash,user_id,email,name,created_at,expires_at) VALUES (?,?,?,?,?,?)',tokenHash,row.user_id,row.email,row.name,now,now+2592000000);
  return json({token});
}

function connectPage(code,user,locale='zh') {
  const en=locale==='en';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return shell(en?'Connect VS Code':'连接 VS Code',`<main id="main" class="auth card"><h1>${en?'Connect SoloDrop in VS Code':'连接 VS Code 中的 SoloDrop'}</h1><p>${en?'Use this account and its sharing plan in your editor:':'在编辑器中使用这个账号及其分享套餐：'}</p><p><strong>${escape(user.email)}</strong></p><p class="muted">${en?'Only approve if you just chose to log in from SoloDrop in VS Code.':'仅当你刚刚在 VS Code 的 SoloDrop 中点击了登录时，才确认连接。'}</p><button id="connect">${en?'Connect this account':'确认连接此账号'}</button><p id="connect-status" role="status" aria-live="polite"></p></main>`,`<script>document.getElementById('connect').onclick=async function(){this.disabled=true;const status=document.getElementById('connect-status');try{const response=await fetch('/api/device/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:${JSON.stringify(code)}})});if(!response.ok)throw Error();status.textContent=${JSON.stringify(en?'Connected. Return to VS Code to continue.':'已连接，返回 VS Code 即可继续。')};}catch{status.textContent=${JSON.stringify(en?'This request could not be approved. Start login again in VS Code.':'未能完成连接，请返回 VS Code 重新登录。')};this.disabled=false;}};</script>`,user,locale);
}

export { deviceRequest, connectPage };
