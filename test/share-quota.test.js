import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { LinkRegistry } from '../worker/src/index.mjs';

function registry() {
  const db = new DatabaseSync(':memory:');
  const sql = {exec(query,...bindings) {
    if (!bindings.length && query.includes(';')) { db.exec(query); return []; }
    const statement=db.prepare(query);
    return statement.columns().length ? statement.all(...bindings) : (statement.run(...bindings),[]);
  }};
  return new LinkRegistry({storage:{sql}});
}
const request=(registry,path,body)=>registry.fetch(new Request(`https://registry${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));

test('concurrent reservations cannot exceed the account quota, and released/expired bytes are reusable',async()=>{
  const r=registry();
  const base={userId:'owner',size:6,limit:10,expiresAt:Date.now()+10000};
  const results=await Promise.all(['one','two'].map(slug=>request(r,'/share-quota/reserve',{...base,slug})));
  assert.deepEqual(results.map(x=>x.status).sort(),[201,413]);
  await request(r,'/share-quota/release',{slug:'one'});
  assert.equal((await request(r,'/share-quota/reserve',{...base,slug:'three'})).status,201);
  assert.equal((await request(r,'/share-quota/reserve',{...base,slug:'other',userId:'other'})).status,201);
  await request(r,'/share-quota/release',{slug:'three'});
  assert.equal((await request(r,'/share-quota/reserve',{...base,slug:'expired',expiresAt:Date.now()-1})).status,201);
  assert.equal((await request(r,'/share-quota/reserve',{...base,slug:'four'})).status,201);
});

test('an owner can release a historical deleted share whose R2 metadata is already missing',async()=>{
  const {deleteShare}=await import('../worker/src/shares.mjs');
  const r=registry();
  await request(r,'/activity',{id:'old-activity',userId:'owner',email:'owner@example.com',fileName:'old',sizeBytes:6,status:'ready'});
  await r.fetch(new Request('https://registry/activity/old-activity',{method:'PATCH',body:JSON.stringify({status:'ready',shortSlug:'Old2345'})}));
  // Use the actual stored activity because legacy activity IDs were UUIDs.
  r.sql.exec("UPDATE activities SET short_slug = 'Old2345' WHERE id = 'old-activity'");
  const reserve=()=>request(r,'/share-quota/reserve',{slug:'New2345',userId:'owner',size:1,limit:5,expiresAt:Date.now()+10000});
  assert.equal((await reserve()).status,413);
  const env={PREVIEWS:{get:async()=>null},LINKS:{idFromName:()=> 'registry',get:()=>({fetch:(url,options)=>r.fetch(new Request(url,options))})}};
  await deleteShare(new Request('https://drop.szlk.ai/api/shares/Old2345',{method:'DELETE'}),'Old2345',env,{id:'other'});
  assert.equal((await reserve()).status,413);
  assert.equal((await deleteShare(new Request('https://drop.szlk.ai/api/shares/Old2345',{method:'DELETE'}),'Old2345',env,{id:'owner'})).status,204);
  assert.equal((await reserve()).status,201);
});
