import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {LinkRegistry} from '../worker/src/index.mjs';
function setup(){const db=new DatabaseSync(':memory:');const sql={exec(query,...args){if(!args.length&&query.includes(';')){db.exec(query);return [];}const s=db.prepare(query);return s.columns().length?s.all(...args):(s.run(...args),[]);}};const registry=new LinkRegistry({storage:{sql}});return {db,call:(path,body)=>registry.fetch(new Request('https://registry'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}))};}

test('device login requires browser approval and the private polling secret, and is single-use',async()=>{
  const {call}=setup();
  const started=await call('/device/start',{});
  assert.equal(started.status,201);
  const {code,secret}=await started.json();
  assert.equal((await call('/device/poll',{code,secret})).status,202);
  assert.equal((await call('/device/approve',{code,user:{id:'u1',email:'a@example.com'}})).status,200);
  assert.equal((await call('/device/approve',{code,user:{id:'u2',email:'b@example.com'}})).status,409);
  assert.equal((await call('/device/poll',{code,secret:'attacker'})).status,403);
  const completed=await call('/device/poll',{code,secret});assert.equal(completed.status,200);
  const {token}=await completed.json();assert.ok(token.length>=64);
  assert.equal((await call('/device/poll',{code,secret})).status,410);
});

test('expired device codes cannot be approved or redeemed',async()=>{
  const {call,db}=setup();const start=await call('/device/start',{});assert.equal(start.status,201);
  const {code,secret}=await start.json();db.prepare('UPDATE device_codes SET expires_at = ?').run(Date.now()-1);
  assert.equal((await call('/device/approve',{code,user:{id:'u',email:'a@example.com'}})).status,410);
  assert.equal((await call('/device/poll',{code,secret})).status,410);
});
