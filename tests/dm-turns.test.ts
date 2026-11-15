import assert from 'node:assert/strict';
import test from 'node:test';
import {registerDmTurn,waitForDmTurn,claimDmTurn,watchDmTurn} from '../supabase/functions/instagram-live-webhook/dmTurns';
test('quiet-window waits reset until the latest persisted batch is ready',async()=>{
 let time=0,calls=0;const sleeps:number[]=[];
 const admin={rpc:async()=>({data:++calls===1?{revision:2,latest:true,quiet_ms:1200,ready:false,pending_ids:['one','two']}:{revision:2,latest:true,quiet_ms:0,ready:true,pending_ids:['one','two']}})};
 const turn={workspace:'a',sender:'same',revision:2,pending_ids:['two']};
 assert.equal(await waitForDmTurn(admin,turn,{now:()=>time,sleep:async n=>{sleeps.push(n);time+=n;}}),true);
 assert.deepEqual(sleeps,[1200]);assert.deepEqual(turn.pending_ids,['one','two']);
});
test('an older worker stops waiting when a newer revision arrives',async()=>{
 const admin={rpc:async()=>({data:{revision:3,latest:false,ready:true,quiet_ms:0}})};
 assert.equal(await waitForDmTurn(admin,{workspace:'a',sender:'x',revision:2,pending_ids:[]}),false);
 assert.equal(await claimDmTurn(admin,{workspace:'a',sender:'x',revision:2,pending_ids:[]}),false);
});
test('coordination errors fail closed instead of sending independent replies',async()=>{
 await assert.rejects(registerDmTurn({rpc:async()=>({error:{code:'offline'}})},'w','c','m'),/coordination unavailable/);
});
test('model request signal is aborted when a new customer message supersedes it',async()=>{
 const watch=watchDmTurn({rpc:async()=>({data:{revision:2,latest:false}})},{workspace:'w',sender:'c',revision:1,pending_ids:['m']});
 await new Promise<void>(resolve=>watch.signal.addEventListener('abort',()=>resolve(),{once:true}));
 assert.equal(watch.signal.aborted,true);watch.stop();
});
