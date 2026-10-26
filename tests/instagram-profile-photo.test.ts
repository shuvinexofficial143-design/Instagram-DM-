import test from 'node:test';
import assert from 'node:assert/strict';
import {cacheInstagramProfilePhoto} from '../supabase/functions/instagram-live-webhook/instagramProfiles';
const source='https://scontent.example.cdninstagram.com/profile.jpg';
const jpeg=new Uint8Array([255,216,255,224,1,2,3]);
test('real Meta thumbnail is cached as an image data URL without forwarding credentials',async()=>{
 let calls=0;
 const cached=await cacheInstagramProfilePhoto(source,async(url,options)=>{calls++;assert.equal(url,source);assert.equal(options?.headers,undefined);assert.equal(options?.redirect,'manual');return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});});
 assert.equal(cached,'data:image/jpeg;base64,'+Buffer.from(jpeg).toString('base64'));assert.equal(calls,1);
});
test('photo cache refuses non-Meta URLs and never follows a redirect to an internal host',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});};
 for(const url of ['http://scontent.example.cdninstagram.com/a','https://cdninstagram.com.evil.example/a','https://user:pass@scontent.example.cdninstagram.com/a','https://127.0.0.1/a','data:image/svg+xml,<svg/>'])assert.equal(await cacheInstagramProfilePhoto(url,fetcher),'');
 assert.equal(calls,0);assert.equal(await cacheInstagramProfilePhoto(source,fetcher),source);assert.equal(calls,1);
});
test('oversized responses and a lying image content-type cannot enter the private photo cache',async()=>{
 assert.equal(await cacheInstagramProfilePhoto(source,async()=>new Response('bad',{headers:{'content-type':'image/jpeg'}})),source);
 assert.equal(await cacheInstagramProfilePhoto(source,async()=>new Response(new Uint8Array(65537),{headers:{'content-type':'image/jpeg'}})),source);
 assert.equal(await cacheInstagramProfilePhoto(source,async()=>new Response(jpeg,{headers:{'content-type':'text/html'}})),source);
});
test('an already cached thumbnail avoids another CDN request',async()=>{
 const cached='data:image/jpeg;base64,'+Buffer.from(jpeg).toString('base64');
 assert.equal(await cacheInstagramProfilePhoto(cached,async()=>{throw Error('Must not fetch');}),cached);
});
