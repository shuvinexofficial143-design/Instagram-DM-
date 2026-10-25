import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const webhook=load('supabase/functions/instagram-live-webhook/index.ts');
const context=load('src/context/AppContext.tsx');
const inbox=load('src/components/Inbox/InboxPage.tsx');
const sql=load('supabase/migrations/20261025_authenticated_inbox_message_time_permission.sql');

test('authenticated Inbox may compute generated timestamps without granting private campaign RPC access',()=>{
 assert.match(load('supabase/migrations/20261021124744_smart_conversation_memory.sql'),/generated always as\s*\(coalesce\(public\.autoreply_campaign_message_time/);
 assert.match(load('supabase/migrations/20261019074816_admin_campaign_storage.sql'),/revoke all on function public\.autoreply_campaign_message_time\(text\) from public,anon,authenticated/);
 assert.match(sql,/grant execute on function public\.autoreply_campaign_message_time\(text\) to authenticated, service_role/);
 assert.doesNotMatch(sql,/grant execute on function public\.autoreply_campaign_eligibility/);
 assert.doesNotMatch(sql,/to anon\s*,\s*authenticated/);
});
test('an inbound response to a human Instagram opener matches the active AI DM automation',async()=>{
 const fn=webhook.match(/function matchAutomation\([\s\S]*?\n}\n/);
 assert.ok(fn,'automation matcher must be present');
 const source=fn[0].replace('function matchAutomation','export function matchAutomation');
 const {code}=await transform(source,{loader:'ts',format:'esm'});
 const {matchAutomation}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const auto={id:'dm-ai',status:'active',trigger_type:'dm_ai_conversation',trigger_config:{all_or_keywords:'ai_conversation'}};
 const event={triggerType:'dm',senderId:'123456789',recipientId:'99999',text:'Please send the price',messageId:'new-inbound-id'};
 assert.equal(matchAutomation([auto],event)?.id,'dm-ai');
 assert.equal(matchAutomation([{...auto,status:'paused'}],event),null);
 assert.match(webhook,/context\.thread_human_handoff === true \|\| context\.thread_ai_paused === true/);
 assert.match(webhook,/const inboundSaved = persistInboundMessage/);
 assert.match(webhook,/if \(!await inboundSaved\)/);
});
test('real Meta customer profile is verified by scoped ID before being shown',()=>{
 assert.match(webhook,/\[LIVE_DM_SENDER_PROFILE_ID_MISMATCH\]/);
 assert.match(webhook,/String\(payload\?\.id \|\| ""\) !== senderId/);
 assert.match(context,/guestProfileRetryAt/);
 assert.match(context,/signedInProfileRetryAt/);
 assert.match(inbox,/AI reply not sent:/);
 assert.match(inbox,/latestReplyFailure/);
});
