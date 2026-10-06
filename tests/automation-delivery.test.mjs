import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import { createHmac } from 'node:crypto';

const source = (await fs.readFile(new URL('../supabase/functions/instagram-live-webhook/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const compiled = await transform(source + '\nglobalThis.helpers = { extractAutomationEvents, matchAutomation, executeStaticActions, createTypingSession, persistInboundMessage };', { loader: 'ts', format: 'esm' });
const ai = { id: 'ai-rule', name: 'AI', status: 'active', trigger_type: 'dm_ai_conversation', trigger_config: {},
  actions: [{ type: 'ai_chatbot', ai_system_instruction: 'Sell watches' }, { type: 'send_dm', message_text: 'Fallback reply' }] };
const staticRule = (type, config = {}) => ({ id: type + '-rule', name: type, status: 'active', trigger_type: type, trigger_config: config,
  actions: [{ type: 'send_dm', message_text: 'Static reply' }] });

function fixture(automations = [ai], options = {}) {
  const writes = [], apiCalls = [], aiInputs = [], claims = new Set(), history = new Map(), tasks = [];
  const account = { ig_user_id: 'business', username: 'business_handle', access_token: 'test-token' };
  const admin = {
    from(table) {
      let columns = '', mutation = null, filters = {};
      const query = {
        select(value) { columns = value; return query; },
        eq(key, value) { filters[key] = value; return query; },
        or() { return query; }, delete() { mutation = { deleted: true, ...filters }; return query; }, in() { return query; }, order() { return query; }, limit() { return query; },
        upsert(value) { mutation = value; return query; }, update(value) { mutation = value; return query; },
        async maybeSingle() { return result(true); },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
      async function result(single) {
        if (mutation) {
          writes.push({ table, ...mutation, ...(mutation.deleted ? filters : {}) });
          if (table === 'autoreply_dm_history') history.set(mutation.sender_id, mutation.messages);
          return { data: null, error: null };
        }
        if (table === 'autoreply_plans') {
          assert.equal(columns, 'id,total_messages,ai_replies');
          return options.quotaError ? { error: { code: 'network' } } : { data: { id: 'free', total_messages: 1500, ai_replies: 1000 } };
        }
        if (table === 'autoreply_profiles') throw new Error('Production identity table has no data column');
        if (table === 'autoreply_documents' && filters.collection === 'automations') {
          options.onRulesStart?.();
          if (options.rulesGate) await options.rulesGate;
          return { data: automations.map(a => ({ id: a.id, data: a })) };
        }
        if (table === 'autoreply_documents' && filters.collection === 'contacts') return { data: options.contacts || [] };
        if (table === 'autoreply_documents') return { data: single ? null : [] };
        return { data: single ? null : [] };
      }
      return query;
    },
    async rpc(name, args) {
      if (name === 'autoreply_get_usage') {
        options.onUsageStart?.();
        if (options.usageGate) await options.usageGate;
        return { data: { total_messages: options.quotaUsed || 0, ai_replies: 0 } };
      }
      if (name === 'autoreply_prepare_automation_event') {
        options.onPrepare?.();
        if (options.prepareGate) await options.prepareGate;
        if (options.quotaError) return { data: null, error: { code: 'database' } };
        const duplicate = claims.has(args.p_message_id);
        claims.add(args.p_message_id);
        return { data: { user_id: 'workspace', account, automation: ai,
          automations, quota: { totalUsed: options.quotaUsed || 0, aiUsed: options.aiUsed || 0, totalLimit: 1500, aiLimit: 1000 },
          history: history.get(args.p_sender_id) || [], message_state: duplicate ? 'duplicate' : 'new' } };
      }
      return { data: {}, error: null };
    },
  };
  let handler;
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, Request, Response, URL, TextEncoder, AbortController, AbortSignal, setTimeout: options.setTimeout || setTimeout, clearTimeout: options.clearTimeout || clearTimeout, performance, crypto: globalThis.crypto,
    createClient: () => admin,
    EdgeRuntime: { waitUntil: task => tasks.push(task) },
    Deno: { env: { get: key => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service', INSTAGRAM_APP_SECRET: 'relay-secret', OPENAI_API_KEY: options.noAI ? '' : 'ai-key' })[key] }, serve: value => { handler = value; } },
    fetch: async (url, init = {}) => {
      const body = JSON.parse(init.body || '{}');
      if (String(url).includes('api.openai.com')) {
        aiInputs.push(body.messages);
        if (options.aiFails) return Response.json({ error: { message: 'AI outage' } }, { status: 503 });
        return Response.json({ choices: [{ message: { content: 'AI: ' + body.messages.at(-1).content } }] });
      }
      if (String(url).includes('graph.instagram.com')) {
        apiCalls.push({ url: String(url), body, signal: init.signal });
        if (body.message && options.sendFails) return Response.json({ error: { message: 'Missing permission' } }, { status: 403 });
        if (body.sender_action === 'typing_on') options.onTypingAttempt?.(apiCalls.filter(c=>c.body.sender_action==='typing_on').length);
        if (body.sender_action === 'typing_on' && options.typingGate) await options.typingGate;
        if (body.sender_action === 'typing_on' && options.typingFailure && apiCalls.filter(c=>c.body.sender_action==='typing_on').length===1) return Response.json({error:{message:'Temporary error'}},{status:options.typingFailure});
        if (body.message) { options.onSend?.(); if (options.sendGate) await options.sendGate; return Response.json({ message_id: 'out-' + apiCalls.length }); }
        if (String(url).endsWith('/replies')) return Response.json({ id: 'public-reply' });
        return Response.json({ username: 'customer' });
      }
      throw new Error('Unexpected network request ' + url);
    },
  });
  vm.runInContext(compiled.code, context);
  return {
    helpers: context.helpers, apiCalls, aiInputs, writes,
    persist: (item, profile, count = true) => context.helpers.persistInboundMessage(admin, "workspace", item, profile, count),
    async post(event, secret = 'relay-secret') {
      const response = await handler(new Request('https://project.supabase.co/functions/v1/instagram-live-webhook', { method: 'POST',
        body: JSON.stringify({ event, metaAppSecret: secret }) }));
      for (let i = 0; i < tasks.length; i++) await tasks[i];
      return { status: response.status, body: await response.json() };
    },
    async direct(event, secret = 'relay-secret') {
      const body = JSON.stringify(event);
      const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
      const response = await handler(new Request('https://project.supabase.co/functions/v1/instagram-live-webhook', {
        method: 'POST', body, headers: { 'x-hub-signature-256': signature },
      }));
      for (let i = 0; i < tasks.length; i++) await tasks[i];
      return { status: response.status, body: await response.json() };
    },
  };
}

const dm = (id = 'm1', text = 'price?', extras = {}) => ({ object: 'instagram', entry: [{ id: 'business', time: Date.now(), messaging: [
  { sender: { id: 'customer' }, recipient: { id: 'business' }, timestamp: Date.now(), message: { mid: id, text, ...extras } },
] }] });
const comment = (media = 'post1', text = 'price') => ({ object: 'instagram', entry: [{ id: 'business', time: Date.now(), changes: [
  { field: 'comments', value: { id: 'comment1', text, from: { id: 'customer' }, media: { id: media } } },
] }] });

test('first AI DM generates and sends a confirmed reply against real schema', async () => {
  const f = fixture(); const r = await f.post(dm());
  assert.equal(r.status, 200); assert.equal(r.body.sent, 1); assert.equal(f.aiInputs.length, 1);
  assert.equal(f.apiCalls.filter(c => c.body.message).length, 1);
  assert.deepEqual(f.apiCalls.filter(c => c.body.sender_action).map(c => c.body.sender_action), ['typing_on', 'typing_off']);
  assert.ok(f.apiCalls.findIndex(c => c.body.sender_action === 'typing_off') > f.apiCalls.findIndex(c => c.body.message), 'Typing is stopped after the send request');
});
test('two distinct messages in one batch both reply and the second sees history', async () => {
  const f = fixture(); const event = dm('m1', 'first'); event.entry[0].messaging.push(dm('m2', 'second').entry[0].messaging[0]);
  const r = await f.post(event); assert.equal(r.body.sent, 2);
  assert.ok(f.aiInputs[1].some(m => m.role === 'assistant' && m.content.includes('first')));
});
test('webhook retry never sends a duplicate reply', async () => {
  const f = fixture(); await f.post(dm()); const r = await f.post(dm());
  assert.equal(r.body.sent, 0); assert.equal(r.body.results[0].duplicate, true);
  assert.equal(f.apiCalls.filter(c => c.body.message).length, 1);
});
test('AI failure sends the configured fallback and turns typing off', async () => {
  const f = fixture([ai], { aiFails: true }); const r = await f.post(dm());
  assert.equal(r.body.sent, 1); assert.equal(r.body.results[0].fallbackUsed, true);
  assert.equal(f.apiCalls.find(c => c.body.message).body.message.text, 'Fallback reply');
});
test('static keyword DM takes precedence over AI without an AI request', async () => {
  const f = fixture([ai, staticRule('dm', { all_or_keywords: 'keywords', keywords: ['price'] })]); const r = await f.post(dm());
  assert.equal(r.body.sent, 1); assert.equal(f.aiInputs.length, 0);
  assert.equal(f.apiCalls.find(c => c.body.message).body.message.text, 'Static reply');
});
test('story rules target the selected story and never fall through to AI', async () => {
  const f = fixture([ai, staticRule('story_reply', { media_scope: 'specific_media', selected_media_id: 'story1' })]);
  assert.equal((await f.post(dm('storymsg', 'nice', { reply_to: { story: { id: 'story1' } } }))).body.sent, 1);
  assert.equal((await f.post(dm('otherstory', 'nice', { reply_to: { story: { id: 'other' } } }))).body.sent, 0);
  assert.equal(f.aiInputs.length, 0);
});
test('comments send one private reply by comment_id before the public reply', async () => {
  const rule = staticRule('comment', { media_scope: 'specific_media', selected_media_id: 'post1' });
  rule.actions.unshift({ type: 'reply_comment', comment_reply_text: 'Sent you a DM' });
  const f = fixture([ai, rule]); const r = await f.post(comment());
  assert.equal(r.body.sent, 1); assert.equal(f.aiInputs.length, 0);
  assert.equal(f.apiCalls[0].body.recipient.comment_id, 'comment1');
  assert.equal(f.apiCalls[1].body.message, 'Sent you a DM');
  assert.ok(f.apiCalls.every(c => c.signal instanceof AbortSignal));
});
test('comment media and keyword mismatches send nothing', async () => {
  const f = fixture([ai, staticRule('comment', { media_scope: 'specific_media', selected_media_id: 'post1', all_or_keywords: 'keywords', keywords: ['price'] })]);
  assert.equal((await f.post(comment('post2'))).body.sent, 0);
  assert.equal((await f.post(comment('post1', 'hello'))).body.sent, 0);
});
test('failed private reply cannot publish a false sent-you-a-DM comment', async () => {
  const rule = staticRule('comment'); rule.actions.push({ type: 'reply_comment', comment_reply_text: 'Sent you a DM' });
  const f = fixture([rule], { sendFails: true }); const r = await f.post(comment());
  assert.equal(r.body.sent, 0); assert.equal(r.body.results[0].reason, 'automation_action_failed');
  assert.equal(f.apiCalls.length, 1);
});
test('preparation or quota failure blocks send before typing and returns an error', async () => {
  const f = fixture([ai], { quotaError: true }); const r = await f.post(dm());
  assert.equal(r.body.results[0].reason, 'context_lookup_failed'); assert.equal(f.apiCalls.length, 0);

});
test('exhausted quota never starts typing', async () => {
  const f = fixture([ai], { quotaUsed: 1500 }); const r = await f.post(dm());
  assert.equal(r.body.results[0].reason, 'monthly_message_limit_reached'); assert.equal(f.apiCalls.length, 0);
});
test('paused automations and echo notifications send nothing', async () => {
  const f = fixture([{ ...ai, status: 'paused' }]); assert.equal((await f.post(dm())).body.sent, 0);
  assert.equal((await f.post(dm('echo', 'test', { is_echo: true }))).body.processed, 0);
});
test('untrusted relay payload cannot trigger an automation', async () => {
  const f = fixture(); assert.equal((await f.post(dm(), 'wrong')).status, 403); assert.equal(f.apiCalls.length, 0);
});
test('signed direct Meta webhook delivers, while an invalid signature cannot send', async () => {
  const f = fixture(); assert.equal((await f.direct(dm('invalid'), 'wrong')).status, 403);
  assert.equal((await f.direct(dm())).body.sent, 1);
});
test('two customers using identical words are never mistaken for an echo', async () => {
  const f = fixture(); await f.post(dm('first', 'price?'));
  const event = dm('second', 'price?'); event.entry[0].messaging[0].sender.id = 'another-customer';
  assert.equal((await f.post(event)).body.sent, 1);
});
test('oversized configured delay fails visibly without holding the request open', async () => {
  const rule = staticRule('dm'); rule.actions.unshift({ type: 'add_delay', delay_seconds: 3600 });
  const f = fixture([rule]); const r = await f.post(dm());
  assert.equal(r.body.results[0].reason, 'configured_delay_exceeds_20_seconds'); assert.equal(f.apiCalls.length, 0);
});
test('a legacy unsupported auto-like cannot prevent the comment DM from sending', async () => {
  const rule = staticRule('comment'); rule.actions.unshift({ type: 'auto_like_comment' });
  const f = fixture([rule]); const r = await f.post(comment());
  assert.equal(r.body.sent, 1); assert.deepEqual(r.body.results[0].skipped_actions, ['auto_like_comment']);
});


function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function withinDeadline(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Independent read/send did not start')), 1000);
  })]); } finally { clearTimeout(timer); }
}
test('one preparation RPC gates typing and AI without separate rule/usage network reads', async () => {
  const ready = deferred(), started = deferred();
  const f = fixture([ai], { prepareGate: ready.promise, onPrepare: started.resolve,
    onRulesStart: () => { throw new Error('Rules should be in the preparation RPC'); },
    onUsageStart: () => { throw new Error('Usage should be in the preparation RPC'); } });
  const request = f.post(dm());
  try { await withinDeadline(started.promise); assert.equal(f.apiCalls.length, 0); assert.equal(f.aiInputs.length, 0); }
  finally { ready.resolve(); }
  assert.equal((await request).body.sent, 1);
});
test('slow typing acknowledgement cannot delay generating and sending the reply', async () => {
  const typing = deferred(), sent = deferred();
  const f = fixture([ai], { typingGate: typing.promise, onSend: sent.resolve });
  const request = f.post(dm());
  try { await withinDeadline(sent.promise); assert.equal(f.aiInputs.length, 1); }
  finally { typing.resolve(); }
  await request;
  const log = f.writes.find(w => w.collection === 'webhook_events' && w.data.status === 'sent').data;
  for (const field of ['meta_ingress_ms', 'verification_ms', 'rules_ms', 'quota_ms', 'eligibility_ms', 'typing_api_ms', 'typing_ack_ms', 'message_to_send_ack_ms']) {
    assert.equal(typeof log[field], 'number', field);
    assert.ok(log[field] >= 0, field);
  }
  assert.equal(log.typing_accepted, true);
});
test('unflagged outgoing event with a different business sender scope cannot trigger AI', async () => {
  const f = fixture(); const event = dm('outgoing', 'AI reply');
  event.entry[0].messaging[0].sender.id = 'business-in-another-scope';
  event.entry[0].messaging[0].recipient.id = 'customer';
  const r = await f.post(event);
  assert.equal(r.body.results[0].reason, 'outgoing_message');
  assert.equal(f.aiInputs.length, 0); assert.equal(f.apiCalls.length, 0);
});

test('self notification without recipient or echo flag cannot trigger AI', async () => {
  const f = fixture(); const event = dm('self', 'Our outgoing reply');
  const message = event.entry[0].messaging[0];
  delete message.recipient; delete message.sender;
  message.from = { id: 'another-business-scope', username: 'business_handle' };
  assert.equal((await f.post(event)).body.sent, 0);
  assert.equal(f.aiInputs.length, 0); assert.equal(f.apiCalls.length, 0);
});
test('is_self notifications never generate an AI reply', async () => {
  const f = fixture(); assert.equal((await f.post(dm('self', 'Reply', { is_self: true }))).body.processed, 0);
  assert.equal(f.aiInputs.length, 0);
});

test('typing stays active throughout a slow Send API request and stops after confirmation', async () => {
  const delivery = deferred(), sending = deferred();
  const f = fixture([ai], { sendGate: delivery.promise, onSend: sending.resolve });
  const request = f.post(dm());
  try {
    await withinDeadline(sending.promise);
    await new Promise(done => setImmediate(done));
    assert.ok(f.apiCalls.some(c => c.body.sender_action === 'typing_on'));
    assert.equal(f.apiCalls.some(c => c.body.sender_action === 'typing_off'), false,
      'No empty gap while Meta is still accepting the message');
  } finally { delivery.resolve(); }
  assert.equal((await request).body.sent, 1);
  assert.equal(f.apiCalls.filter(c => c.body.sender_action === 'typing_off').length, 1);
});


test('transient typing failure retries independently while AI sends one reply', async () => {
  const gate=deferred(),retried=deferred();
  const f = fixture([ai], { typingFailure: 500,sendGate:gate.promise,onTypingAttempt:n=>{if(n===2)retried.resolve();} });
  const request=f.post(dm('retry-typing'));
  try { await retried.promise; } finally { gate.resolve(); }
  await request;
  assert.equal(f.aiInputs.length, 1);
  assert.equal(f.apiCalls.filter(c=>c.body.message).length, 1);
  assert.equal(f.apiCalls.filter(c=>c.body.sender_action==='typing_on').length, 2);
});

test('a stale turn cannot turn off the next turn while the first typing request is pending', async () => {
  const f = fixture(), pending = deferred(), entered = deferred(), calls=[];
  const first=f.helpers.createTypingSession('conversation',async(action)=>{calls.push('old:'+action);entered.resolve();await pending.promise;return {};},()=>{});
  await entered.promise;
  const oldStop=first.stop();
  const second=f.helpers.createTypingSession('conversation',async(action)=>{calls.push('new:'+action);return {};},()=>{});
  pending.resolve();
  await Promise.all([first.first,oldStop,second.first]);
  assert.deepEqual(calls,['old:typing_on','new:typing_on']);
  await second.stop();
  assert.deepEqual(calls,['old:typing_on','new:typing_on','new:typing_off']);
});

test('permanent typing errors do not retry or prevent the text reply', async()=>{
  const f=fixture([ai],{typingFailure:403});
  await f.post(dm('denied-typing'));
  assert.equal(f.apiCalls.filter(c=>c.body.sender_action==='typing_on').length,1);
  assert.equal(f.apiCalls.filter(c=>c.body.message).length,1);
});


test('long replies refresh typing and stopping cancels the scheduled refresh', async()=>{
  const timers=new Map();let next=0;const calls=[];
  const f=fixture([ai],{setTimeout:(callback,ms)=>{const id=++next;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)});
  const session=f.helpers.createTypingSession('refresh-conversation',async action=>{calls.push(action);return {};},()=>{});
  await session.first;
  assert.equal(timers.size,1);
  const [id,timer]=[...timers.entries()][0];assert.equal(timer.ms,4000);
  timers.delete(id);timer.callback();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,['typing_on','typing_on']);assert.equal(timers.size,1);
  await session.stop();
  assert.equal(timers.size,0);assert.deepEqual(calls,['typing_on','typing_on','typing_off']);
});


test('inbox receives messages with every automation off and no usage or typing', async () => {
  const f = fixture([{ ...ai, status: 'paused' }]);
  const r = await f.post(dm('paused-inbound'));
  assert.equal(r.body.sent, 0);
  assert.ok(f.writes.some(row => row.collection === 'inbox_messages' && row.id === 'paused-inbound' && row.data.direction === 'in'));
  assert.equal(f.apiCalls.filter(call => call.body?.sender_action || call.body?.message).length, 0);
  assert.equal(f.writes.filter(row => row.collection === 'inbox_messages' && row.data.direction === 'out').length, 0);
});
test('inbox receives messages when quota is exhausted or a keyword does not match', async () => {
  for (const f of [fixture([ai], {quotaUsed:1500}), fixture([staticRule('dm',{all_or_keywords:'keywords',keywords:['buy']})])]) {
    const r = await f.post(dm('unreplied-inbound','hello'));
    assert.equal(r.body.sent,0);
    assert.ok(f.writes.some(row => row.collection === 'inbox_messages' && row.id === 'unreplied-inbound'));
  }
});


test('verified username reconciles changed sender IDs and preserves earliest contact history', async () => {
  const f = fixture([], { contacts: [
    { id: 'old', data: { ig_user_id: 'old', ig_username: 'customer', first_interaction_at: '2026-09-01T00:00:00Z', interactions: { dms: 7 }, tags: ['VIP'], status: 'converted', avatar_url: 'saved-photo' } },
    { id: 'new', data: { ig_user_id: 'new', ig_username: 'customer', first_interaction_at: '2026-10-01T00:00:00Z', interactions: { dms: 12 }, tags: ['New'] } },
  ] });
  const saved = await f.persist({ senderId: 'new', messageId: 'm', triggerType: 'dm', timestamp: Date.now(), text: 'hello' }, { username: 'customer', avatar_url: '' }, false);
  assert.equal(saved.contact.id, 'old'); assert.equal(saved.contact.ig_user_id, 'new');
  assert.equal(saved.contact.interactions.dms, 19); assert.equal(saved.contact.status, 'converted');
  assert.equal(saved.contact.first_interaction_at, '2026-09-01T00:00:00Z');
  assert.equal(saved.inbox.from_avatar, 'saved-photo');
  assert.deepEqual(Array.from(saved.contact.ig_user_ids).sort(), ['new', 'old']);
  assert.ok(f.writes.some(w => w.collection === 'contact_identity_archive' && w.id === 'new'));
  assert.ok(f.writes.some(w => w.deleted && w.id === 'new'));
});

test('numeric fallback keeps saved username and photo when Meta profile lookup fails', async () => {
  const f = fixture([], { contacts: [{ id: 'original', data: { ig_user_id: '123456789', ig_user_ids: ['123456789'], ig_username: 'customer', avatar_url: 'photo', interactions: { dms: 7 } } }] });
  const saved = await f.persist({ senderId: '123456789', messageId: 'm', triggerType: 'dm', timestamp: Date.now(), text: 'hi' }, { username: '123456789', avatar_url: '' });
  assert.equal(saved.contact.id, 'original'); assert.equal(saved.inbox.from_username, 'customer');
  assert.equal(saved.inbox.from_avatar, 'photo'); assert.equal(saved.contact.interactions.dms, 8);
});

test('different verified usernames are never merged', async () => {
  const f = fixture([], { contacts: [{ id: 'other', data: { ig_user_id: 'other', ig_username: 'someone_else', interactions: { dms: 9 } } }] });
  const saved = await f.persist({ senderId: 'new', messageId: 'm', triggerType: 'dm', timestamp: Date.now(), text: 'hi' }, { username: 'customer', avatar_url: '' });
  assert.equal(saved.contact.id, 'new'); assert.equal(saved.contact.interactions.dms, 1);
  assert.equal(f.writes.filter(w => w.deleted).length, 0);
});
