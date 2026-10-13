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
 assert.match(home,/AI Replies uses verified billing counters/);
 assert.match(home,/Short-period AI replies are counted only/);
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
 assert.match(analytics,/Verified AI usage/);
 assert.match(analytics,/AI replies \(Inbox\)/);
});
test('hardcoded trial days are replaced with the actual stored expiry',()=>{
 const banner=read('src/components/Common/PlanBanner.tsx');
 assert.doesNotMatch(banner,/You have 5 days remaining/);
 assert.match(banner,/daysLeft/);
});
