import React, { useId, useRef, useState } from 'react';
import { Check, Info, Loader2, Trash2 } from 'lucide-react';
import { Catalog, CatalogProduct } from '../../lib/catalogs';
import { CatalogDialog } from './CatalogDialog';
import { ProductImages } from './ProductImages';

const message = (e: unknown) => e instanceof Error ? e.message : 'Could not save. Please retry.';
const recordId = (kind: string) => kind + '_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
const optional = <span className="catalog-optional">Optional</span>;

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
      <ProductImages workspaceId={workspaceId} catalogId={catalog.id} images={draft.images || []} onChange={images => update({ images })} onBusy={setUploading} disabled={saving} />
      <fieldset disabled={busy} className="catalog-fields">
        <div className="catalog-form-row"><label>Product name <span aria-hidden="true" className="catalog-required">*</span><input required maxLength={150} value={draft.name} onChange={e => update({ name: e.target.value })} placeholder="e.g. Heart photo frame" /></label><label>Price {optional}<input maxLength={200} value={draft.price} onChange={e => update({ price: e.target.value })} placeholder="e.g. ₹399" /><span className="catalog-field-hint">Leave blank to skip price replies.</span></label></div>
        <label>Description & variants {optional}<textarea maxLength={4000} rows={3} value={draft.description} onChange={e => update({ description: e.target.value })} placeholder="Colours, sizes, customisation, delivery details…" /></label>
        <label>Product link {optional}<input type="url" maxLength={2048} value={draft.url} onChange={e => update({ url: e.target.value })} placeholder="https://your-store.com/product" /></label>
        <label className="catalog-toggle-row"><span><strong>Active product</strong><span>Available in AI and DM replies</span></span><input type="checkbox" role="switch" checked={draft.active} onChange={e => update({ active: e.target.checked })} /></label>
      </fieldset>
      <details className="catalog-inline-help"><summary><Info size={15} />What details should I add?</summary><p>Use confirmed product details. AI can answer from the name, price and description. Add photos for swipeable image replies; the first photo is your cover.</p></details>
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
        <label className="catalog-toggle-row"><span><strong>Active catalog</strong><span>Available for your automations</span></span><input type="checkbox" role="switch" checked={draft.active} onChange={e => setDraft(p => ({ ...p, active: e.target.checked }))} /></label>
      </fieldset>
      {onDelete && <div className="catalog-delete-section"><div><strong>Delete catalog</strong><p>Removes this catalog and {productCount} product{productCount === 1 ? '' : 's'}.</p></div><button type="button" className="catalog-icon-button catalog-danger" aria-label="Delete catalog" disabled={busy} onClick={onDelete}><Trash2 size={18} /></button></div>}
    </form>
  </CatalogDialog>;
}
