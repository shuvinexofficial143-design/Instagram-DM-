import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = (await fs.readFile(new URL('../supabase/functions/instagram-account-store/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const compiled = await transform(source + '\nglobalThis.helpers = { ensureWebhookSubscription, fetchInstagramMedia };', { loader: 'ts', format: 'esm' });
function runtime(fetch) {
  const context = vm.createContext({ fetch, console: { log() {}, warn() {}, error() {} }, URLSearchParams, AbortSignal,
    Deno: { serve() {}, env: { get() {} } } });
  vm.runInContext(compiled.code, context);
  return context.helpers;
}
test('Instagram subscription uses accepted Instagram fields rather than Facebook fields', async () => {
  const helpers = runtime(async (url, init) => {
    const fields = new URL(url).searchParams.get('subscribed_fields').split(',');
    const accepted = new Set(['messages', 'messaging_postbacks', 'messaging_seen', 'comments', 'live_comments', 'mentions']);
    assert.ok(fields.every(field => accepted.has(field)));
    assert.ok(fields.includes('messages') && fields.includes('comments'));
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ success: true });
  });
  assert.equal(await helpers.ensureWebhookSubscription('token', 'business'), true);
});
test('subscription failures report false rather than pretending delivery is configured', async () => {
  let calls = 0;
  const helpers = runtime(async () => { calls++; return Response.json({ error: { message: 'Permission denied' } }, { status: 403 }); });
  assert.equal(await helpers.ensureWebhookSubscription('token', 'business'), false);
  assert.equal(calls, 2);
});
test('story media is normalized and empty active stories is a valid result', async () => {
  const helpers = runtime(async (_url, init) => { assert.ok(init.signal instanceof AbortSignal); return Response.json({ data: [] }); });
  assert.equal((await helpers.fetchInstagramMedia('token', 'story')).length, 0);
});
