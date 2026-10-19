import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Home uses verified ledger for lifetime AI replies, not inbox-only automation IDs',()=>{
 const api=read('api/billing.ts'),home=read('src/components/Home/HomePage.tsx');
 assert.match(api,/action === "dashboard-metrics"/);
 assert.match(api,/autoreply_usage_monthly\?select=/);
 assert.match(api,/owner_user_id|user\.id/);
 assert.match(api,/aiRepliesAllTime:totalAi/);
 assert.match(home,/useState<Period>\('all'\)/);
 assert.match(home,/verifiedAi\?\.all/);
 assert.doesNotMatch(home,/AI Replies uses verified billing counters/);
 assert.doesNotMatch(home,/Short-period AI replies are counted only when/);
});
test('connected Instagram dashboard is held until workspace hydration finishes',()=>{
 const app=read('src/App.tsx'),context=read('src/context/AppContext.tsx');
 assert.match(app,/workspaceHydrating \|\| accountSwitching/);
 assert.match(app,/accountError/);
 assert.match(context,/setWorkspaceHydrating\(true\)/);
 assert.match(context,/setWorkspaceHydrating\(false\)/);
 assert.match(context,/previousAuthenticatedUid/);
 assert.match(context,/selected\?\.username/);
 assert.match(context,/setWorkspaceDataLoading\(true\)/);
 assert.match(context,/markLoaded\('inbox'\)/);
 assert.match(homeData(),/value===null\?'—'/);
});
function homeData(){return read('src/components/Home/HomePage.tsx')}
test('the dashboard does not invent zero data when initial reads fail',()=>{
 const home=homeData(),context=read('src/context/AppContext.tsx');
 assert.match(home,/workspaceDataError/);
 assert.match(home,/Metrics are withheld rather than displaying an incorrect zero/);
 assert.match(context,/workspaceDataError/);
});
test('real user_ Instagram identifiers are not filtered as fake messages',()=>{
 const ctx=read('src/context/AppContext.tsx');
 assert.doesNotMatch(ctx,/uname\.startsWith\('user_'\)/);
 assert.match(ctx,/item\.is_test === true/);
});
test('fabricated 98% / 100% automation open rates are removed',()=>{
 const ctx=read('src/context/AppContext.tsx'),analytics=read('src/components/Analytics/AnalyticsPage.tsx'),auto=read('src/components/Automations/AutomationsPage.tsx');
 assert.doesNotMatch(ctx,/open_rate: 98/);
 assert.doesNotMatch(ctx,/open_rate: 100/);
 assert.doesNotMatch(auto,/open_rate: 100/);
 assert.match(analytics,/Not tracked/);
 assert.doesNotMatch(analytics,/Verified AI usage/);
 assert.doesNotMatch(analytics,/border-orange-100 bg-orange-50\/70/);
 assert.match(analytics,/AI replies \(Inbox\)/);
});
test('hardcoded trial days are replaced with the actual stored expiry',()=>{
 const banner=read('src/components/Common/PlanBanner.tsx');
 assert.doesNotMatch(banner,/You have 5 days remaining/);
 assert.match(banner,/daysLeft/);
});


test('Missing contact status never fabricates a converted lead',()=>{
 const context=read('src/context/AppContext.tsx');
 assert.doesNotMatch(context,/status: c\.status \|\| 'converted'/);
 assert.match(context,/status: c\.status \|\| 'lead'/);
});
test('Admin counts come from complete private owner-scoped contact ledger, not fixed zero',()=>{
 const edge=read('supabase/functions/instagram-account-store/index.ts');
 const admin=read('src/components/Admin/AdminPage.tsx');
 const migration=read('supabase/migrations/20261014_admin_contact_counts.sql');
 assert.match(edge,/admin\.rpc\("autoreply_admin_contact_counts"\)/);
 assert.match(edge,/contactCounts: contactsRes\.data/);
 assert.match(admin,/contactsByUser\.get\(profile\.user_id\)/);
 assert.match(admin,/prev\.total_messages \+= Math\.max\(0,Number\(row\.total_messages/);
 assert.match(migration,/revoke all on function public\.autoreply_admin_contact_counts/);
});
test('Signed-in Inbox and Analytics refresh from real records when Realtime is delayed',()=>{
 const client=read('src/lib/supabase.ts');
 assert.match(client,/window\.setInterval/);
 assert.match(client,/\['inbox_messages','automations','contacts','webhook_events','webhook_logs','ai_thread_controls','workspace_notices'\]/);
 assert.match(client,/document\.addEventListener\('visibilitychange'/);
 assert.match(client,/document\.hidden/);
});
test('Missing automation status or timestamps are not invented',()=>{
 const ctx=read('src/context/AppContext.tsx');
 assert.match(ctx,/status: auto\?\.status === 'active' \? 'active' : 'paused'/);
 assert.match(ctx,/created_at: auto\?\.created_at \|\| ''/);
});

test('Billing loading is neutral and does not flash a warning or fake plan',()=>{
 const page=read('src/components/Billing/BillingUsagePage.tsx');
 const hook=read('src/hooks/useWorkspaceUsage.ts');
 assert.doesNotMatch(page,/Live usage totals are being verified/);
 assert.doesNotMatch(page,/Checking plan…/);
 assert.doesNotMatch(page,/Checking live billing data/);
 assert.match(page,/animate-pulse/);
 assert.match(page,/Usage data is temporarily unavailable/);
 assert.match(page,/usage\.retry/);
 assert.match(hook,/billingUsageCache/);
 assert.match(hook,/ownerId===userId/);
 assert.match(hook,/FRESH_CACHE_MS/);
});
