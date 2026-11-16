import React, { useId, useRef, useState } from 'react';
import { Check, Info, Loader2, Trash2, Images, LayoutGrid, Sparkles, MessageSquare } from 'lucide-react';
import { Catalog, CatalogProduct } from '../../lib/catalogs';
import { CatalogDialog } from './CatalogDialog';
import { ProductImages } from './ProductImages';
import { catalogDeliveryStyles } from '../../lib/catalogState';
import type { CatalogVariant } from '../../../supabase/functions/instagram-live-webhook/catalogRuntime';

const message = (e: unknown) => e instanceof Error ? e.message : 'Could not save. Please retry.';
const recordId = (kind: string) => kind + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
const optional = <span className="catalog-optional">Optional</span>;


/** A variant is a priced, photographed design/color/size within one parent product. */
function VariantEditor({v,onUpdate,onDelete,workspaceId,catalogId,onBusy,disabled}:{
  v:CatalogVariant;onUpdate:(patch:Partial<CatalogVariant>)=>void;onDelete:()=>void;
  workspaceId:string;catalogId:string;onBusy:(busy:boolean)=>void;disabled:boolean;
}){
 const fields=(label:string,values?:string[])=>(
  <label>{label}<textarea rows={2} value={(values||[]).join('\n')} onChange={e=>onUpdate({[label==='Linked Meta Ad IDs'?'ad_refs':label==='Linked Instagram Reels / Posts / Media IDs'?'reel_refs':'required_customer_fields']:e.target.value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean)} as Partial<CatalogVariant>)} placeholder={label==='Required customer details'?'e.g. Custom text, Recipient name':'One Reel or Post URL, or Instagram Media ID, per line'} /></label>
 );
 return <fieldset className="catalog-post-references">
  <legend>Variant — {v.name||'New design'}</legend>
  <div className="catalog-form-row">
   <label>Design / variant name<input required maxLength={150} value={v.name} onChange={e=>onUpdate({name:e.target.value})} placeholder="e.g. Heart Frame" /></label>
   <label>Style Number<input maxLength={40} value={v.style_number||''} onChange={e=>onUpdate({style_number:e.target.value})} placeholder="FR-01" /></label>
  </div>
  <div className="catalog-form-row">
   <label>Variant price<input maxLength={200} value={v.price||''} onChange={e=>onUpdate({price:e.target.value})} placeholder="Blank = parent price" /></label>
   <label>Availability<input maxLength={200} value={v.availability||''} onChange={e=>onUpdate({availability:e.target.value})} placeholder="In stock" /></label>
  </div>
  <div className="catalog-form-row">
   <label>Color<input maxLength={100} value={v.color||''} onChange={e=>onUpdate({color:e.target.value})}/></label>
   <label>Size<input maxLength={100} value={v.size||''} onChange={e=>onUpdate({size:e.target.value})}/></label>
  </div>
  <label>What makes this design different?<textarea rows={2} maxLength={1600} value={v.description||''} onChange={e=>onUpdate({description:e.target.value})} /></label>
  <ProductImages workspaceId={workspaceId} catalogId={catalogId} images={v.images||[]} onChange={images=>onUpdate({images})} onBusy={onBusy} disabled={disabled} />
  <div className="catalog-form-row">
   <label>Customer photos minimum<input type="number" min={0} max={30} value={v.customer_photo_min??''} onChange={e=>onUpdate({customer_photo_min:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Inherit from product" /></label>
   <label>Customer photos maximum<input type="number" min={0} max={30} value={v.customer_photo_max??''} onChange={e=>onUpdate({customer_photo_max:e.target.value===''?undefined:Number(e.target.value)})} placeholder="Inherit from product" /></label>
  </div>
  {fields('Required customer details',v.required_customer_fields)}
  <label>Extra questions / instructions for this variant<textarea maxLength={1200} rows={2} value={v.customer_instructions||''} onChange={e=>onUpdate({customer_instructions:e.target.value})} placeholder="Ask for the custom name printed on this design" /></label>
  <label>What AI should tell the customer about this variant<textarea maxLength={1200} rows={2} value={v.sales_notes||''} onChange={e=>onUpdate({sales_notes:e.target.value})} /></label>
  {fields('Linked Meta Ad IDs',v.ad_refs)}
  {fields('Linked Instagram Reels / Posts / Media IDs',v.reel_refs)}
  <button type="button" className="catalog-button catalog-secondary" disabled={disabled} onClick={onDelete}><Trash2 size={15}/> Remove this variant</button>
 </fieldset>;
}

export function ProductEditor({ workspaceId, catalog, product, onClose, onSave, onDelete }: {
  workspaceId: string; catalog: Catalog; product?: CatalogProduct;
  onClose: () => void; onSave: (p: CatalogProduct) => Promise<void>; onDelete: (p: CatalogProduct) => Promise<void>;
}) {
  const [initial] = useState<CatalogProduct>(() => product ? { ...product, images: [...(product.images || [])] } : { id: recordId('product'), catalog_id: catalog.id, name: '', price: '', description: '', url: '', active: true, images: [] });
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('');
  const lock = useRef(false);
  const formId = useId();
  const busy = saving || uploading;
  const close = () => { if (!busy && (JSON.stringify(draft) === JSON.stringify(initial) || window.confirm('Discard unsaved product changes?'))) onClose(); };
  const update = (values: Partial<CatalogProduct>) => setDraft(previous => ({ ...previous, ...values }));
  const updateVariant=(id:string,patch:Partial<CatalogVariant>)=>update({variants:(draft.variants||[]).map(v=>v.id===id?{...v,...patch}:v)});
  const run = async (action: () => Promise<void>) => {
    if (lock.current || uploading) return;
    lock.current = true; setSaving(true); setError('');
    try { await action(); } catch (e) { setError(message(e)); } finally { lock.current = false; setSaving(false); }
  };
  return <CatalogDialog title={product ? 'Edit product' : 'Add product'} subtitle={catalog.name} busy={busy} onClose={close} footer={<>
    {product && <button type="button" className="catalog-icon-button catalog-danger" disabled={busy} aria-label="Delete product" title="Delete product" onClick={() => { if (window.confirm(`Delete “${product.name}”? This cannot be undone.`)) void run(() => onDelete(product)); }}><Trash2 size={18} /></button>}
    <button type="button" className="catalog-button catalog-secondary" disabled={busy} onClick={close}>Cancel</button>
    <button type="submit" form={formId} className="catalog-button catalog-primary" disabled={busy || !draft.name.trim()}>{busy ? <Loader2 size={17} className="catalog-spin" /> : <Check size={17} />}{uploading ? 'Uploading…' : saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button>
  </>}>
    <form id={formId} className="catalog-form" onSubmit={e => { e.preventDefault(); void run(() => onSave(draft)); }}>
      {error && <div role="alert" className="catalog-alert">{error}</div>}
      <p className="catalog-field-hint">Add one product per design. Use extra photos for different views of this same design.</p>
      <ProductImages workspaceId={workspaceId} catalogId={catalog.id} images={draft.images || []} onChange={images => update({ images })} onBusy={setUploading} disabled={saving} />
      <fieldset disabled={busy} className="catalog-fields">
        <div className="catalog-form-row"><label>Product name <span aria-hidden="true" className="catalog-required">*</span><input required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="e.g. Heart photo frame" /></label><label>Price {optional}<input maxLength={200} value={draft.price} onChange={e => update({ price: e.target.value })} placeholder="e.g. ₹399" /><span className="catalog-field-hint">Leave blank to skip price replies.</span></label></div>
        <div className="catalog-form-row"><label>Style Number {optional}<input maxLength={40} value={draft.style_number||''} onChange={e=>update({style_number:e.target.value})} placeholder="e.g. 07 or FR-07"/><span className="catalog-field-hint">Use one unique Style Number per design.</span></label><label>Availability {optional}<input maxLength={500} value={draft.availability||''} onChange={e=>update({availability:e.target.value})} placeholder="e.g. In stock · white only"/></label></div>
        <div className="catalog-form-row"><label>COD {optional}<input maxLength={500} value={draft.cod||''} onChange={e=>update({cod:e.target.value})} placeholder="e.g. Available / Not available"/></label><label>Delivery time {optional}<input maxLength={500} value={draft.delivery_time||''} onChange={e=>update({delivery_time:e.target.value})} placeholder="e.g. 5–7 days · free delivery"/></label></div>
        <label>Customization {optional}<input maxLength={500} value={draft.customization||''} onChange={e=>update({customization:e.target.value})} placeholder="e.g. Customer photo and name can be added"/></label>
        <fieldset className="catalog-post-references"><legend>Instagram post photo order {optional}</legend><p className="catalog-field-hint">Map this design to its photo number in a post. Style Number and photo order are separate.</p>{(draft.post_refs||[]).map((ref,index)=><div key={index} className="catalog-post-reference"><label>Post link or ID<input maxLength={200} value={ref.post_id} onChange={e=>update({post_refs:draft.post_refs!.map((item,i)=>i===index?{...item,post_id:e.target.value}:item)})} placeholder="Instagram post URL or media ID"/></label><label>Photo number<input type="number" min={1} max={100} value={ref.position||''} onChange={e=>update({post_refs:draft.post_refs!.map((item,i)=>i===index?{...item,position:Number(e.target.value)}:item)})}/></label><button type="button" className="catalog-icon-button" aria-label={`Remove post reference ${index+1}`} onClick={()=>update({post_refs:draft.post_refs!.filter((_,i)=>i!==index)})}><Trash2 size={16}/></button></div>)}<button type="button" className="catalog-button catalog-secondary" disabled={(draft.post_refs?.length||0)>=20} onClick={()=>update({post_refs:[...(draft.post_refs||[]),{post_id:'',position:1}]})}>Add post reference</button></fieldset>
        <fieldset className="catalog-post-references"><legend>Instagram Ad / Reel / Post source {optional}</legend>
          <p className="catalog-field-hint">Connect a product to Meta Ad IDs or Instagram Reel or Post links. When a signed Instagram DM referral identifies one unique product, AI can start with it. If the same source belongs to multiple products, AI asks the customer instead of guessing.</p>
          {(draft.ad_refs||[]).map((ad,index)=><div key={'ad'+index} className="catalog-post-reference"><label>Meta Ad ID<input maxLength={100} value={ad} onChange={e=>update({ad_refs:draft.ad_refs!.map((id,i)=>i===index?e.target.value:id)})} placeholder="e.g. 120200012345678901" /></label><button type="button" className="catalog-icon-button" aria-label={`Remove Ad ID ${index+1}`} onClick={()=>update({ad_refs:draft.ad_refs!.filter((_,i)=>i!==index)})}><Trash2 size={16}/></button></div>)}
          <button type="button" className="catalog-button catalog-secondary" disabled={(draft.ad_refs?.length||0)>=30} onClick={()=>update({ad_refs:[...(draft.ad_refs||[]),'']})}>Add Meta Ad ID</button>
          {(draft.reel_refs||[]).map((reel,index)=><div key={'reel'+index} className="catalog-post-reference"><label>Reel / Post link or Media ID<input maxLength={200} value={reel} onChange={e=>update({reel_refs:draft.reel_refs!.map((id,i)=>i===index?e.target.value:id)})} placeholder="https://www.instagram.com/reel/ABC123/" /></label><button type="button" className="catalog-icon-button" aria-label={`Remove Reel reference ${index+1}`} onClick={()=>update({reel_refs:draft.reel_refs!.filter((_,i)=>i!==index)})}><Trash2 size={16}/></button></div>)}
          <button type="button" className="catalog-button catalog-secondary" disabled={(draft.reel_refs?.length||0)>=30} onClick={()=>update({reel_refs:[...(draft.reel_refs||[]),'']})}>Add Reel / Post / Media ID</button>
        </fieldset>
        <fieldset className="catalog-post-references">
         <legend>Product-specific customer information</legend>
         <p className="catalog-field-hint">Keep universal name, phone and address collection in the Master Prompt. Here specify only this product's extra requirements, such as 15–20 customer photos for a custom frame.</p>
         <div className="catalog-form-row">
          <label>Customer photos minimum<input type="number" min={0} max={30} value={draft.customer_photo_min??''} onChange={e=>update({customer_photo_min:e.target.value===''?undefined:Number(e.target.value)})} /></label>
          <label>Customer photos maximum<input type="number" min={0} max={30} value={draft.customer_photo_max??''} onChange={e=>update({customer_photo_max:e.target.value===''?undefined:Number(e.target.value)})} /></label>
         </div>
         <label>Other details to collect from customer<textarea rows={2} value={(draft.required_customer_fields||[]).join('\n')} onChange={e=>update({required_customer_fields:e.target.value.split(/[,\n]/).map(x=>x.trim()).filter(Boolean)})} placeholder="One detail per line, e.g. Custom text or Name to print" /></label>
         <label>Instructions for asking customer<textarea rows={3} maxLength={1200} value={draft.customer_instructions||''} onChange={e=>update({customer_instructions:e.target.value})} placeholder="Ask customer to send clear photos before proceeding" /></label>
         <label>What AI should tell customer<textarea rows={3} maxLength={1200} value={draft.sales_notes||''} onChange={e=>update({sales_notes:e.target.value})} placeholder="Special information, benefits, precautions, gifting advice" /></label>
        </fieldset>
        <fieldset className="catalog-post-references"><legend>Product variants / designs</legend>
         <p className="catalog-field-hint">A variant can have its own price, photos, color, size, requirements and Instagram Ad/Reel/Post links. Leave variant price blank to inherit this product's price. Uploaded variant reference photos are NOT customer order photos.</p>
         {(draft.variants||[]).map(v=><VariantEditor key={v.id} v={v} workspaceId={workspaceId} catalogId={catalog.id} disabled={busy} onBusy={setUploading} onUpdate={patch=>updateVariant(v.id,patch)} onDelete={()=>update({variants:(draft.variants||[]).filter(item=>item.id!==v.id)})}/>)}
         <button type="button" className="catalog-button catalog-secondary" disabled={busy||(draft.variants?.length||0)>=100} onClick={()=>update({variants:[...(draft.variants||[]),{id:recordId('variant'),name:'',images:[]}]})}>+ Add variant / design</button>
        </fieldset>
        <label>Description & variants {optional}<textarea maxLength={4000} rows={3} value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="Colours, sizes, customisation, delivery details…" /></label>
        <label>Product link {optional}<input type="url" maxLength={2048} value={draft.url} onChange={e => update({ url: e.target.value })} placeholder="https://your-store.com/product" /></label>
        <label className="catalog-toggle-row"><span><strong>Active product</strong><span>Available in AI and DM replies</span></span><input type="checkbox" role="switch" checked={draft.active} onChange={e => update({ active: e.target.checked })} /></label>
      </fieldset>
      <details className="catalog-inline-help"><summary><Info size={15} />What details should I add?</summary><p>Use confirmed product details. AI can answer from the name, price and description. Add photos for swipeable image replies; the first photo is your cover. Keep each design as a separate product. Leave unknown policies blank; AI must not invent them.</p></details>
    </form>
  </CatalogDialog>;
}

export function CatalogEditor({ catalog, productCount = 0, onClose, onSave, onDelete }: {
  catalog?: Catalog; productCount?: number; onClose: () => void; onSave: (c: Catalog) => Promise<void>; onDelete?: () => void;
}) {
  const [initial] = useState<Catalog>(() => catalog ? { ...catalog } : { id: recordId('catalog'), name: '', description: '', active: true });
  const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), formId = useId();
  const close = () => { if (!busy && (JSON.stringify(draft) === JSON.stringify(initial) || window.confirm('Discard unsaved catalog changes?'))) onClose(); };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(message(e)); } finally { lock.current = false; setBusy(false); }
  };
  return <CatalogDialog title={catalog ? 'Catalog settings' : 'New catalog'} subtitle={catalog ? catalog.name : 'A collection for your products.'} busy={busy} onClose={close} footer={<>
    <button type="button" className="catalog-button catalog-secondary" disabled={busy} onClick={close}>Cancel</button><button type="submit" form={formId} className="catalog-button catalog-primary" disabled={busy || !draft.name.trim()}>{busy ? <Loader2 size={17} className="catalog-spin" /> : <Check size={17} />}{busy ? 'Saving…' : catalog ? 'Save changes' : 'Create catalog'}</button>
  </>}>
    <form id={formId} className="catalog-form" onSubmit={e => { e.preventDefault(); void run(() => onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() })); }}>
      {error && <div role="alert" className="catalog-alert">{error}</div>}
      <fieldset disabled={busy} className="catalog-fields">
        <label>Catalog name <span aria-hidden="true" className="catalog-required">*</span><input autoFocus required maxLength={80} value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Birthday gifts" /></label>
        <label>Description {optional}<textarea maxLength={500} rows={2} value={draft.description} onChange={e => setDraft(p => ({ ...p, description: e.target.value }))} placeholder="What belongs in this collection?" /></label>
        <fieldset className="catalog-style-picker"><legend>How should this catalog be sent?</legend><p className="catalog-style-hint">Photos are grouped together, up to 10 per message.</p><div>{catalogDeliveryStyles.map((style,index)=>{const Icon=[LayoutGrid,MessageSquare,Sparkles,Images][index];return <label key={style.value} className={(draft.delivery_style||'cards')===style.value?'is-selected':''}><input type="radio" name="delivery-style" value={style.value} checked={(draft.delivery_style||'cards')===style.value} onChange={()=>setDraft(p=>({...p,delivery_style:style.value}))}/><Icon size={20}/><span><strong>{style.label}</strong><span>{style.description}</span></span><Check size={16} className="catalog-style-check"/></label>;})}</div></fieldset>
        <label className="catalog-toggle-row"><span><strong>Active catalog</strong><span>Available for your automations</span></span><input type="checkbox" role="switch" checked={draft.active} onChange={e => setDraft(p => ({ ...p, active: e.target.checked }))} /></label>
      </fieldset>
      {onDelete && <div className="catalog-delete-section"><div><strong>Delete catalog</strong><p>Removes this catalog and {productCount} product{productCount === 1 ? '' : 's'}.</p></div><button type="button" className="catalog-icon-button catalog-danger" aria-label="Delete catalog" disabled={busy} onClick={onDelete}><Trash2 size={18} /></button></div>}
    </form>
  </CatalogDialog>;
}
