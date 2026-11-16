import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogMessage,catalogDeliveryParts,prepareCatalogDelivery,generateCatalogReply,type RuntimeCatalog} from '../supabase/functions/instagram-live-webhook/catalogRuntime';

const product={
 id:'frame-02',name:'Personalized Photo Frame — Sister Floral Memory Frame',style_number:'Style FR-02',
 price:'₹250',description:'Soft floral birthday design with calendar, decorative elements and a neat memory collage.',
 url:'',images:['https://images.example/frame-02.jpg'],cod:'Available',
 delivery_time:'5-6 Days • free delivery',
 customization:"Personalized photo frame with customer's own photos. Multiple beautiful designs available.",
 customer_photo_min:7,customer_photo_max:10,
 required_customer_fields:['Customer name','Clear photo','Address'],
 sales_notes:'Beautiful personalized photo frames for birthdays and family. Internal directions for seller should not appear.',
 availability:'Available'
};
const catalog:RuntimeCatalog={id:'frames',name:'All products',delivery_style:'photos_ai',products:[product]};

test('Roman Hindi photo request sends photo and short Hindi sales caption, not merchant database fields',async()=>{
 const fetcher=async()=>Response.json({choices:[{message:{tool_calls:[{id:'photo',function:{name:'send_product_photos',arguments:JSON.stringify({selections:[{product_id:'frame-02',image_indexes:[0]}],caption:'Which design would you like?'})}}]}}]});
 const result=await generateCatalogReply({key:'test',systemPrompt:'Offer photo frames',history:[],text:'Product ki phot',catalog,fetcher});
 assert.ok(result.catalog);
 const parts=catalogDeliveryParts(result.catalog!);
 assert.deepEqual(parts.map(p=>p.kind),['image','text']);
 assert.equal(parts[0].message.attachment.payload.url,product.images[0]);
 const caption=parts[1].text;
 assert.match(caption,/₹250/);
 assert.match(caption,/फोटो|डिज़ाइन|डिजाइन/);
 assert.match(caption,/COD|Cash on Delivery/);
 assert.ok(new TextEncoder().encode(caption).length<900,'Single product description should be one DM');
 assert.doesNotMatch(caption,/Which design|Extra order details|Notes:|Customer photos needed|Availability:|Internal directions|Customer name|Address/);
});
test('image gallery sends only one concise style list instead of dumping every internal product record',()=>{
 const all={...catalog,products:Array.from({length:8},(_,i)=>({...product,id:'frame-'+i,style_number:'Style '+(i+1),name:'Style-'+(i+1)+'-Frame.png',images:['https://images.example/frame-'+i+'.jpg']}))};
 const parts=catalogDeliveryParts(prepareCatalogDelivery(all));
 assert.equal(parts[0].kind,'image');
 assert.equal(parts[0].message.attachments.length,8);
 const text=parts.slice(1).map(x=>x.text).join('');
 assert.ok(new TextEncoder().encode(text).length<900);
 assert.match(text,/₹250/);
 assert.doesNotMatch(text,/Notes:|Customer photos needed|Extra order details|Availability:|Internal directions/);
});
test('explicit photos_details mode also hides administrative order fields',()=>{
 const text=catalogMessage({...catalog,delivery_style:'photos_details'});
 assert.match(text,/₹250/);
 assert.doesNotMatch(text,/Extra order details|Notes:|Customer photos needed|Internal directions/);
});
