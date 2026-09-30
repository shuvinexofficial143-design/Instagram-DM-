import React, { useEffect, useState } from 'react';
import { Package, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth, removeUserDocument, saveUserDocument, subscribeToUserCollection } from '../../lib/supabase';

type Product = { id: string; name: string; price: string; description: string; url: string; active: boolean; updated_at?: string };

export const CatalogPage: React.FC = () => {
  const { setActiveTab, setIsBuilderOpen } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [draft, setDraft] = useState<Omit<Product, 'id'>>({ name: '', price: '', description: '', url: '', active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToUserCollection<Product>(uid, 'catalog_products', setProducts);
  }, []);

  const addProduct = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !draft.name.trim()) return;
    setSaving(true);
    try {
      const item: Product = { id: 'product_' + Date.now(), ...draft, name: draft.name.trim(), updated_at: new Date().toISOString() };
      await saveUserDocument(uid, 'catalog_products', item);
      setDraft({ name: '', price: '', description: '', url: '', active: true });
    } finally { setSaving(false); }
  };

  const saveProduct = async (item: Product) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await saveUserDocument(uid, 'catalog_products', { ...item, updated_at: new Date().toISOString() });
  };

  const removeProduct = async (item: Product) => {
    const uid = auth.currentUser?.uid;
    if (!uid || !window.confirm('Delete ' + item.name + ' from the catalog?')) return;
    await removeUserDocument(uid, 'catalog_products', item.id);
  };

  const useCatalogInAi = () => {
    const active = products.filter((p) => p.active);
    const lines = active.map((p) => '- ' + p.name + (p.price ? ' | Price: ' + p.price : '') + (p.description ? ' | ' + p.description : '') + (p.url ? ' | Link: ' + p.url : ''));
    sessionStorage.setItem('autoreply:prefill-ai-prompt', '# PRODUCT CATALOG\n' + (lines.join('\n') || 'No active products in catalog.') + '\n\nOnly recommend products from this catalog. Do not invent prices, availability or links.');
    setActiveTab('automations');
    setIsBuilderOpen(true);
  };

  return (
    <div className="min-h-full bg-[#F7FAFF] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-indigo-600">Sales content</p><h1 className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">Product Catalog</h1><p className="mt-1 text-sm text-slate-500">Manage product facts that can be reused by AI conversations.</p></div>
          <button onClick={useCatalogInAi} className="flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white"><Sparkles className="h-4 w-4" />Use Catalog in AI</button>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Add product</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Product name" className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400" />
            <input value={draft.price} onChange={(e) => setDraft((p) => ({ ...p, price: e.target.value }))} placeholder="Price, e.g. ₹399" className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400" />
            <textarea value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Short description, variants, stock notes" rows={3} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-indigo-400 md:col-span-2" />
            <input value={draft.url} onChange={(e) => setDraft((p) => ({ ...p, url: e.target.value }))} placeholder="Product / checkout URL (optional)" className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-indigo-400" />
            <button onClick={addProduct} disabled={saving || !draft.name.trim()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{saving ? 'Saving...' : 'Add product'}</button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {products.length ? products.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Package className="h-4.5 w-4.5" /></span>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={item.active} onChange={(e) => setProducts((prev) => prev.map((p) => p.id === item.id ? { ...p, active: e.target.checked } : p))} />Active</label>
              </div>
              <input value={item.name} onChange={(e) => setProducts((prev) => prev.map((p) => p.id === item.id ? { ...p, name: e.target.value } : p))} className="mt-4 w-full border-0 p-0 text-base font-bold text-slate-900 outline-none" />
              <input value={item.price} onChange={(e) => setProducts((prev) => prev.map((p) => p.id === item.id ? { ...p, price: e.target.value } : p))} placeholder="Price" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={item.description} onChange={(e) => setProducts((prev) => prev.map((p) => p.id === item.id ? { ...p, description: e.target.value } : p))} rows={3} placeholder="Description" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input value={item.url} onChange={(e) => setProducts((prev) => prev.map((p) => p.id === item.id ? { ...p, url: e.target.value } : p))} placeholder="Product URL" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <div className="mt-4 flex gap-2"><button onClick={() => void saveProduct(item)} className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white"><Save className="h-4 w-4" />Save</button><button onClick={() => void removeProduct(item)} className="flex min-h-10 items-center justify-center rounded-xl border border-rose-200 px-3 text-rose-600"><Trash2 className="h-4 w-4" /></button></div>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 md:col-span-2">No products yet. Add your first product above.</div>}
        </section>
      </div>
    </div>
  );
};
