import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { powScript } from '../worker/src/pow.mjs';

test('a second share can be deleted after deleting the first on the same page', async () => {
  const nodes = new Map();
  for (const id of ['file','drop','picked','terms','share','status','result','short','copy','delete-share','allow-download','watermark','expiry']) {
    nodes.set(id, { disabled:false, checked:true, value:'day', addEventListener() {}, async click() { if (!this.disabled) await this.onclick(); } });
  }
  nodes.get('file').files = [new File(['Review'], 'review.txt')];
  const removed = [], live = new Map();
  let sequence = 0;
  const window = {};
  vm.runInNewContext(powScript(), {
    window, document:{documentElement:{lang:'en'},getElementById:id=>nodes.get(id)},
    location:{origin:'https://drop.szlk.ai'}, URL, FormData,
    navigator:{clipboard:{writeText:async()=>{}}},
    fetch:async(url, options={}) => {
      if (options.method === 'POST') {
        const slug = `share-${++sequence}`;
        live.set(slug, `token-${sequence}`);
        return Response.json({shortUrl:`https://drop.szlk.ai/${slug}`,managementToken:live.get(slug),expiresAt:new Date(Date.now()+86400000).toISOString()});
      }
      if (options.method === 'DELETE') {
        const slug = url.split('/').pop();
        assert.equal(options.headers.authorization, `Bearer ${live.get(slug)}`);
        live.delete(slug); removed.push(slug);
      }
      return new Response(null, {status:200});
    },
  });
  window.SoloDrop.initShare(10485760);
  nodes.get('file').onchange();
  for (let index=0; index<2; index++) {
    await nodes.get('share').click();
    assert.equal(nodes.get('result').hidden, false);
    assert.equal(nodes.get('delete-share').disabled, false, 'the current share must have an enabled delete action');
    await nodes.get('delete-share').click();
    assert.equal(nodes.get('result').hidden, true);
  }
  assert.deepEqual(removed, ['share-1','share-2']);
  assert.equal(live.size, 0);
});
