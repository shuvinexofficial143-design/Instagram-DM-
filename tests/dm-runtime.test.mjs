import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = (await fs.readFile(new URL('../supabase/functions/instagram-live-webhook/index.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');
const compiled = await transform(source + '\nglobalThis.helpers = { getPlanQuota, aiTimeoutMs, canReuseSharedReply, sendInstagramText };', { loader: 'ts', format: 'esm' });
function runtime(fetch = globalThis.fetch, env = {}) {
  const context = vm.createContext({ console, fetch, AbortSignal, setTimeout, clearTimeout, performance, crypto: globalThis.crypto,
    Deno: { env: { get: key => env[key] }, serve() {} } });
  vm.runInContext(compiled.code, context);
  return context.helpers;
}

test('quota uses a single verified entitlement RPC for a paid workspace', async () => {
  const admin = {rpc: async (name,args) => {
    assert.equal(name,'autoreply_billing_entitlement');
    assert.equal(args.p_workspace_id,'workspace');
    return {data:{plan:'pro',totalUsed:8,aiUsed:3,totalLimit:25000,aiLimit:15000}};
  }};
  const quota=await runtime().getPlanQuota(admin,'workspace');
  assert.equal(quota.plan,'pro');assert.equal(quota.totalLimit,25000);assert.equal(quota.totalUsed,8);
});
test('failed quota reads cannot grant a fresh allowance', async () => {
  const admin={rpc:async()=>({error:{code:'unavailable'},data:null})};
  await assert.rejects(runtime().getPlanQuota(admin,'workspace'),/allowance/);
});

test('shared replies are only used for first-contact nongreetings', () => {
  const h = runtime();
  assert.equal(h.canReuseSharedReply([], 'What is the price?'), true);
  assert.equal(h.canReuseSharedReply([{ role: 'user', content: 'my order is 123' }], 'What is the price?'), false);
  assert.equal(h.canReuseSharedReply([], 'hello'), false);
});

test('AI deadline defaults to 8 seconds and stays bounded', () => {
  assert.equal(runtime().aiTimeoutMs(), 8000);
  assert.equal(runtime(undefined, { DM_AI_TIMEOUT_MS: 'bad' }).aiTimeoutMs(), 8000);
  assert.equal(runtime(undefined, { DM_AI_TIMEOUT_MS: '99999' }).aiTimeoutMs(), 12000);
  assert.equal(runtime(undefined, { DM_AI_TIMEOUT_MS: '1' }).aiTimeoutMs(), 2000);
});

test('send requires Meta message confirmation and carries a timeout', async () => {
  let signal;
  const h = runtime(async (_url, init) => { signal = init.signal; return Response.json({ message_id: 'confirmed' }); });
  assert.equal((await h.sendInstagramText('business', 'customer', 'token', 'reply')).message_id, 'confirmed');
  assert.ok(signal instanceof AbortSignal);
  await assert.rejects(runtime(async () => Response.json({})).sendInstagramText('b', 'c', 't', 'reply'), /confirm/);
});

test('ambiguous send failure never retries', async () => {
  let attempts = 0;
  const h = runtime(async () => { attempts++; throw new Error('timeout'); });
  await assert.rejects(h.sendInstagramText('b', 'c', 't', 'reply'), /timeout/);
  assert.equal(attempts, 1);
});
