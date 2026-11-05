import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCatalogs,watchCatalogs,type CatalogSnapshot,type Catalog} from '../src/lib/catalogState';
import {deleteCatalogRecords} from '../src/lib/catalogManagement';
const catalog:Catalog={id:'default',name:'Main Catalog',description:'',active:true};
const product={id:'one',name:'Frame',price:'₹399',description:'Red frame',url:'',images:['https://images.example/frame.jpg'],active:true};
function fixture(){
 const listeners=new Map<string,{scope:string;data:(rows:any[])=>void;error:(e:Error)=>void}>();
 const snapshots:CatalogSnapshot[]=[];let stopped=0;
 const close=watchCatalogs('workspace-a',(scope,collection,data,error)=>{listeners.set(collection,{scope,data,error});return()=>{stopped++;};},snapshot=>snapshots.push(snapshot));
 return{listeners,snapshots,close,stopped:()=>stopped,last:()=>snapshots.at(-1)!};
}
test('catalog validation waits for both collections instead of treating pending products as empty',()=>{
 const f=fixture();f.listeners.get('catalogs')!.data([catalog]);assert.equal(f.last().loading,true);
 f.listeners.get('catalog_products')!.data([product]);assert.equal(f.last().loading,false);assert.equal(f.last().products[0].active,true);assert.equal(f.last().catalogs[0].id,'default');
 assert.ok([...f.listeners.values()].every(listener=>listener.scope==='workspace-a'));f.close();
});
test('picker and validation can consume the same complete snapshot when products arrive first',()=>{
 const f=fixture();f.listeners.get('catalog_products')!.data([product]);assert.equal(f.last().loading,true);f.listeners.get('catalogs')!.data([]);
 const shared=f.last();assert.equal(shared.loading,false);assert.equal(shared.products.length,1);assert.equal(shared.catalogs[0].id,'default');f.close();
});
test('failed catalog loading stays a load error and can recover without a false empty-product state',()=>{
 const f=fixture();f.listeners.get('catalogs')!.data([catalog]);f.listeners.get('catalog_products')!.error(Error('Network unavailable'));
 assert.equal(f.last().error,'Network unavailable');assert.equal(f.last().loading,false);
 f.listeners.get('catalog_products')!.data([product]);assert.equal(f.last().error,'');assert.equal(f.last().products.length,1);f.close();
});
test('closing a builder disposes both subscriptions and ignores late responses from the old workspace',()=>{
 const f=fixture();f.close();f.listeners.get('catalog_products')!.data([product]);f.listeners.get('catalogs')!.error(Error('Late failure'));
 assert.equal(f.snapshots.length,0);assert.equal(f.stopped(),2);
});
test('reopening subscribes to current products even when the previous subscription missed realtime',()=>{
 const old=fixture();old.listeners.get('catalogs')!.data([]);old.listeners.get('catalog_products')!.data([]);assert.equal(old.last().products.length,0);old.close();
 const reopened=fixture();reopened.listeners.get('catalogs')!.data([]);reopened.listeners.get('catalog_products')!.data([product]);assert.equal(reopened.last().products.length,1);reopened.close();
});
test('deleted Main Catalog does not reappear as the virtual default after reload',()=>{
 const tombstone={...catalog,active:false,deleted:true};
 assert.deepEqual(resolveCatalogs([tombstone]),[]);
 assert.deepEqual(resolveCatalogs([tombstone,{...catalog,id:'new',name:'New collection'}]).map(c=>c.id),['new']);
 assert.equal(resolveCatalogs([])[0].id,'default');
});
test('deleting Main Catalog removes only its products and retains an inactive deletion marker',async()=>{
 const calls:any[]=[];
 const marker=await deleteCatalogRecords('workspace-a',catalog,[product,{...product,id:'other',catalog_id:'other'}],{remove:async(...args)=>{calls.push(['remove',...args]);},save:async(...args)=>{calls.push(['save',...args]);}});
 assert.equal(calls.length,2);assert.deepEqual(calls[0],['remove','workspace-a','catalog_products','one']);assert.equal(calls[1][2],'catalogs');assert.equal(marker?.deleted,true);assert.equal(marker?.active,false);assert.deepEqual(resolveCatalogs([marker!]),[]);
});
test('a custom catalog is deleted after its products, and another catalog remains intact',async()=>{
 const calls:any[]=[];
 const marker=await deleteCatalogRecords('workspace-b',{...catalog,id:'gifts'},[{...product,id:'g',catalog_id:'gifts'},product],{remove:async(...args)=>{calls.push(args);},save:async()=>{throw Error('Custom catalogs do not need a default marker');}});
 assert.deepEqual(calls,[['workspace-b','catalog_products','g'],['workspace-b','catalogs','gifts']]);assert.equal(marker,null);
});
test('a failed product deletion keeps its catalog available for retry',async()=>{
 let saved=false;
 await assert.rejects(deleteCatalogRecords('workspace-a',catalog,[product],{remove:async()=>{throw Error('Permission denied');},save:async()=>{saved=true;}}),/Permission denied/);
 assert.equal(saved,false);
});
test('a missing workspace cannot start deletion',async()=>{
 await assert.rejects(deleteCatalogRecords('',catalog,[product],{remove:async()=>{assert.fail('Must not write');},save:async()=>{assert.fail('Must not write');}}),/Sign in/);
});
test('live catalog loading rejects a deleted default instead of resurrecting its fallback',async()=>{
 const {loadCatalog}=await import('../supabase/functions/instagram-live-webhook/catalogRuntime');
 const admin={from(){const query:any={select(){return query;},eq(){return query;},order(){return query;},range:async()=>({data:[],error:null}),maybeSingle:async()=>({data:{id:'default',data:{...catalog,deleted:true,active:false}},error:null})};return query;}};
 await assert.rejects(loadCatalog(admin,'workspace-a','default'),/missing or inactive/);
});
