import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogDeliveryStyle,prepareCatalogDelivery,catalogDeliveryParts,catalogMessage,safeCatalogCaption,splitCatalogText,selectProductPhotos} from '../supabase/functions/instagram-live-webhook/catalogRuntime';
const product={id:'p',name:'Frame',price:'₹399',description:'Red frame',url:'https://shop.example/frame',images:['https://img.example/a.jpg','https://img.example/b.jpg']};
const base={id:'gifts',name:'Gifts',products:[product]};
test('existing and unknown styles remain product cards',()=>{assert.equal(catalogDeliveryStyle(undefined),'cards');assert.equal(catalogDeliveryStyle('forged'),'cards');assert.equal(catalogDeliveryParts(prepareCatalogDelivery(base))[0].kind,'cards');});
test('photos and details have images before the exact saved facts',()=>{const parts=catalogDeliveryParts(prepareCatalogDelivery({...base,delivery_style:'photos_details'}));assert.deepEqual(parts.map(p=>p.kind),['image','text']);assert.deepEqual(parts[0].message.attachments.map(a=>a.payload.url),product.images);assert.deepEqual(parts[0].catalog.image_urls,product.images);assert.match(parts[1].text,/₹399/);assert.match(parts[1].text,/Red frame/);});
test('21 photos form 10+10+1 messages with no omitted or repeated photos',()=>{
 const images=Array.from({length:21},(_,i)=>'https://img.example/'+i+'.jpg');
 const catalog={...base,delivery_style:'photos_only' as const,products:[{...product,images}]};
 const parts=catalogDeliveryParts(prepareCatalogDelivery(catalog));
 assert.deepEqual(parts.map(p=>p.catalog.image_urls.length),[10,10,1]);
 assert.deepEqual(parts.flatMap(p=>p.message.attachments?.map(a=>a.payload.url)||[p.message.attachment.payload.url]),images);
});
test('specific product photos stay scoped to the selected views',()=>{const selected=selectProductPhotos({...base,delivery_style:'photos_details'},[{product_id:'p',image_indexes:[1]}]);const parts=catalogDeliveryParts(selected);assert.equal(parts[0].message.attachment.payload.url,product.images[1]);assert.equal(parts.length,2);});
test('photos only has no generated or fixed text message',()=>{const catalog=prepareCatalogDelivery({...base,delivery_style:'photos_only'});assert.equal(catalogMessage(catalog),'');assert.ok(catalogDeliveryParts(catalog).every(p=>p.kind==='image'));});
test('AI embellishment cannot inject price changes, policy claims or links',()=>{for(const text of ['Only ₹99','COD available','मुफ्त डिलीवरी','Visit https://fake.example','Premium waterproof item'])assert.equal(safeCatalogCaption(text,'fallback'),'fallback');assert.equal(safeCatalogCaption('Which design do you prefer?'),'Which design do you prefer?');});
test('AI caption is separate from authoritative price and description',()=>{const message=catalogMessage(prepareCatalogDelivery({...base,delivery_style:'photos_ai'},1,'Take a look at these designs.'));assert.match(message,/Take a look/);assert.match(message,/₹399/);assert.match(message,/Red frame/);});
test('long Hindi and emoji details are split without dropping text or breaking Unicode',()=>{const text='नमस्ते 🌸 '.repeat(400);const parts=splitCatalogText(text);assert.equal(parts.join(''),text);assert.ok(parts.every(part=>new TextEncoder().encode(part).length<=900));assert.ok(parts.every(part=>!part.includes('\uFFFD')));});

test('all photo styles use one collection message for multiple photos',()=>{
 for(const delivery_style of ['photos_details','photos_ai','photos_only'] as const){
  const parts=catalogDeliveryParts(prepareCatalogDelivery({...base,delivery_style}));
  assert.equal(parts[0].message.attachments.length,2);assert.equal(parts[0].message.attachment,undefined);
  assert.equal(parts.filter(p=>p.kind==='image').length,1);
 }
});
test('large grouped catalogs send every photo group before any information message',()=>{
 const catalog={...base,delivery_style:'photos_details' as const,products:[{...product,images:Array.from({length:11},(_,i)=>'https://img.example/'+i+'.jpg')}]};
 const parts=catalogDeliveryParts(prepareCatalogDelivery(catalog));assert.deepEqual(parts.map(p=>p.kind),['image','image','text']);
});
