import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronRight, Eye, ImageIcon, Package, Plus, Search, Settings2, Sparkles, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { auth, removeUserDocument, saveUserDocument, subscribeToUserCollection } from '../../lib/supabase';
import { Catalog, CatalogProduct, catalogProblem, defaultCatalog, safeCatalogUrl } from '../../lib/catalogs';
import { CatalogPreview } from './CatalogPicker';
import { CatalogDialog } from './CatalogDialog';
import { CatalogEditor, ProductEditor } from './CatalogEditors';
import './catalog.css';

type Panel = { type: 'new' | 'settings' | 'preview' } | { type: 'product'; product?: CatalogProduct };
type Filter = 'all' | 'active' | 'hidden';
const DEFAULT_ID = 'default';

export const CatalogPage: React.FC = () => {
  const { setActiveTab, setIsBuilderOpen, workspaceId } = useApp();
  const scope = workspaceId || auth.currentUser?.uid || '';
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const collectionRow = useRef<HTMLElement>(null);
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selected, setSelected] = useState(DEFAULT_ID);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setCatalogs([]); setProducts([]); setSelected(DEFAULT_ID); setPanel(null);
    setLoaded(false); setError(''); setNotice(''); setQuery(''); setFilter('all');
    if (!scope) { setError('Sign in to load your catalogs.'); return; }
    let alive = true;
    let catalogsReady = false, productsReady = false;
    const failed = (e: Error) => { if (alive) setError(e.message || 'Could not load catalogs. Please retry.'); };
    const a = subscribeToUserCollection<Catalog>(scope, 'catalogs', saved => {
      if (!alive) return;
      setCatalogs(saved); catalogsReady = true; setLoaded(productsReady);
    }, failed);
    const b = subscribeToUserCollection<CatalogProduct>(scope, 'catalog_products', saved => {
      if (!alive) return;
      setProducts(saved); productsReady = true; setLoaded(catalogsReady);
    }, failed);
    return () => { alive = false; a?.(); b?.(); };
  }, [scope, retry]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const allCatalogs = useMemo(() => [catalogs.find(c => c.id === DEFAULT_ID) || defaultCatalog, ...catalogs.filter(c => c.id !== DEFAULT_ID)], [catalogs]);
  const current = allCatalogs.find(c => c.id === selected) || allCatalogs[0];
  const visible = products.filter(p => (p.catalog_id || DEFAULT_ID) === current.id);
  const activeCount = visible.filter(p => p.active).length;
  const photoCount = visible.filter(p => p.active).reduce((count, p) => count + (p.images?.length || 0), 0);
  const problem = catalogProblem(current, visible, true);
  const search = query.trim().toLocaleLowerCase();
  const results = visible.filter(p => (!search || [p.name, p.description, p.price].some(v => (v || '').toLocaleLowerCase().includes(search))) && (filter === 'all' || (filter === 'active' ? p.active : !p.active)));
  const ready = loaded && !error;
  useEffect(() => {
    const row = collectionRow.current;
    const card = row?.querySelector<HTMLElement>('[aria-current="true"]');
    if (row && card) row.scrollTo({ left: Math.max(0, card.offsetLeft - row.offsetLeft - 2), behavior: 'auto' });
  }, [current.id, loaded, allCatalogs.length]);
  const chooseCatalog = (id: string) => { setSelected(id); setQuery(''); setFilter('all'); };

  const saveCatalog = async (catalog: Catalog) => {
    if (!scope) throw Error('Sign in to save a catalog.');
    await saveUserDocument(scope, 'catalogs', { ...catalog, updated_at: new Date().toISOString() });
    if (currentScope.current !== scope) return;
    setCatalogs(previous => [...previous.filter(c => c.id !== catalog.id), catalog]);
    chooseCatalog(catalog.id); setPanel(null); setNotice(panel?.type === 'new' ? 'Catalog created' : 'Catalog updated');
  };
  const saveProduct = async (product: CatalogProduct) => {
    if (!scope) throw Error('Sign in to save a product.');
    if (!product.name.trim()) throw Error('Enter a product name.');
    if (product.url && !safeCatalogUrl(product.url)) throw Error('Use a secure HTTPS product link.');
    const catalogId = product.catalog_id || DEFAULT_ID;
    if (!allCatalogs.some(c => c.id === catalogId)) throw Error('This catalog was removed. Close this form and choose another catalog.');
    const saved = { ...product, name: product.name.trim(), catalog_id: catalogId, updated_at: new Date().toISOString() };
    await saveUserDocument(scope, 'catalog_products', saved);
    if (currentScope.current !== scope) return;
    setProducts(previous => previous.some(p => p.id === saved.id) ? previous.map(p => p.id === saved.id ? saved : p) : [...previous, saved]);
    setPanel(null); setNotice(panel?.type === 'product' && panel.product ? 'Product updated' : 'Product added');
  };
  const deleteProduct = async (product: CatalogProduct) => {
    if (!scope) throw Error('Sign in to delete a product.');
    await removeUserDocument(scope, 'catalog_products', product.id);
    if (currentScope.current !== scope) return;
    setProducts(previous => previous.filter(p => p.id !== product.id)); setPanel(null); setNotice('Product deleted');
  };
  const deleteCatalog = async () => {
    if (!scope || current.id === DEFAULT_ID) throw Error('The main catalog cannot be deleted.');
    // Keep the catalog available if any product removal fails, so the owner can retry.
    for (const product of visible) await removeUserDocument(scope, 'catalog_products', product.id);
    await removeUserDocument(scope, 'catalogs', current.id);
    if (currentScope.current !== scope) return;
    setProducts(previous => previous.filter(p => (p.catalog_id || DEFAULT_ID) !== current.id));
    setCatalogs(previous => previous.filter(c => c.id !== current.id)); chooseCatalog(DEFAULT_ID);
    setPanel(null); setNotice('Catalog deleted');
  };
  const useInAi = () => {
    if (problem || !ready) return;
    sessionStorage.setItem('autoreply:prefill-catalog', current.id);
    sessionStorage.setItem('autoreply:prefill-ai-prompt', 'Help customers choose products from the selected catalog. Use its current saved product details for prices, descriptions and links. Never invent price, stock or variants. Send only requested product photos. Ask a short clarifying question if a customer image does not clearly identify one product.');
    setActiveTab('automations'); setIsBuilderOpen(true);
  };

  return <div className="catalog-page"><div className="catalog-container">
    <header className="catalog-heading">
      <div><span className="catalog-eyebrow"><Package size={15} />PRODUCT LIBRARY</span><h1>Catalogs</h1><p>Your products, ready for every conversation.</p></div>
      <button className="catalog-button catalog-primary" disabled={!ready} onClick={() => setPanel({ type: 'new' })}><Plus size={18} /><span>New catalog</span></button>
    </header>
    {error && <div role="alert" className="catalog-alert"><span>{error}</span><button onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
    <div role="status" aria-live="polite" className={notice ? 'catalog-toast' : 'catalog-sr-only'}>{notice && <><CheckCircle2 size={18} />{notice}</>}</div>
    {!loaded && !error ? <div className="catalog-loading" role="status"><span className="catalog-sr-only">Loading catalogs</span><div /><div /><div /></div> : <>
      <nav ref={collectionRow} className="catalog-collections" aria-label="Your catalogs">{allCatalogs.map(c => {
        const items = products.filter(p => (p.catalog_id || DEFAULT_ID) === c.id);
        const photos = items.flatMap(p => p.images || []).slice(0, 3);
        return <button key={c.id} className={`catalog-collection ${current.id === c.id ? 'is-selected' : ''}`} aria-current={current.id === c.id ? 'true' : undefined} disabled={!ready} onClick={() => chooseCatalog(c.id)}>
          <div className="catalog-collection-top"><span className="catalog-collection-icon"><Package size={20} /></span>{current.id === c.id ? <span className="catalog-selection"><Check size={13} />Selected</span> : <ChevronRight size={17} className="catalog-muted" />}</div>
          <strong title={c.name}>{c.name}</strong>
          <div className="catalog-collection-bottom"><span>{items.length} product{items.length === 1 ? '' : 's'}{!c.active && ' · Paused'}</span><span className="catalog-photo-stack" aria-hidden="true">{photos.map((url, i) => <img key={i} src={url} alt="" loading="lazy" />)}</span></div>
        </button>;
      })}</nav>
      <section className="catalog-products" aria-label={`Products in ${current.name}`}>
        <div className="catalog-products-heading">
          <div className="catalog-products-title"><h2>Products <span>{visible.length}</span></h2><button className="catalog-icon-button" aria-label="Catalog settings" title="Catalog settings" disabled={!ready} onClick={() => setPanel({ type: 'settings' })}><Settings2 size={18} /></button></div>
          <div className="catalog-product-actions"><button className="catalog-button catalog-secondary" disabled={!ready || !photoCount} onClick={() => setPanel({ type: 'preview' })}><Eye size={17} />Preview</button><button className="catalog-button catalog-primary" disabled={!ready} onClick={() => setPanel({ type: 'product' })}><Plus size={18} />Add product</button></div>
        </div>
        {visible.length > 0 && <div className="catalog-toolbar">
          <div className="catalog-search"><Search size={18} /><input aria-label="Search products" placeholder="Search products…" value={query} onChange={e => setQuery(e.target.value)} />{query && <button className="catalog-icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}</div>
          <div className="catalog-filters" role="group" aria-label="Filter products">{(['all', 'active', 'hidden'] as Filter[]).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Hidden'}<span>{value === 'all' ? visible.length : value === 'active' ? activeCount : visible.length - activeCount}</span></button>)}</div>
        </div>}
        {visible.length === 0 ? <div className="catalog-empty">
          <div className="catalog-empty-visual" aria-hidden="true"><span /><span /><span><ImageIcon size={32} /><i><Plus size={14} /></i></span></div>
          <h3>Your first product starts here</h3><p>Add a photo and a few details.<br />Bring your collection to life in Instagram DMs.</p>
          <button className="catalog-button catalog-primary" disabled={!ready} onClick={() => setPanel({ type: 'product' })}><Plus size={18} />Add your first product</button>
          <span className="catalog-empty-note">Photos optional · Add more details anytime</span>
        </div> : results.length === 0 ? <div className="catalog-no-results"><Search size={28} /><h3>No matching products</h3><p>Try another search or filter.</p><button className="catalog-button catalog-secondary" onClick={() => { setQuery(''); setFilter('all'); }}>Show all products</button></div> : <div className="catalog-product-grid">{results.map(product => <article key={product.id} className="catalog-product-card">
          <button className="catalog-product-open" disabled={!ready} onClick={() => setPanel({ type: 'product', product })} aria-label={`Edit ${product.name}`}>
            <div className="catalog-product-photo">{product.images?.[0] ? <img src={product.images[0]} alt={product.name} loading="lazy" /> : <div className="catalog-product-placeholder"><Package size={32} /><span>No photo</span></div>}<span className={`catalog-product-status ${product.active ? 'is-active' : ''}`}><i />{product.active ? 'Active' : 'Hidden'}</span>{(product.images?.length || 0) > 1 && <span className="catalog-image-count"><ImageIcon size={13} />{product.images!.length}</span>}</div>
            <div className="catalog-product-info"><h3>{product.name}</h3><p className={product.price ? 'catalog-price' : 'catalog-no-price'}>{product.price || 'Price not set'}</p><p className="catalog-product-description">{product.description || 'Add a description'}</p></div>
          </button><button className="catalog-product-edit" disabled={!ready} onClick={() => setPanel({ type: 'product', product })}>Edit product<ChevronRight size={15} /></button>
        </article>)}</div>}
        {visible.length > 0 && <div className="catalog-ai-bar"><span className="catalog-ai-icon"><Sparkles size={20} /></span><div><strong>{!current.active ? 'This catalog is paused' : problem ? 'Your catalog needs attention' : 'Ready for your AI assistant'}</strong><p>{problem || `${activeCount} active product${activeCount === 1 ? '' : 's'} · Current prices, details and photos`}</p></div><button className="catalog-button catalog-secondary" disabled={!ready || !!problem} title={problem || 'Set up an AI reply with this catalog'} onClick={useInAi}><Sparkles size={16} />Use in AI<ChevronRight size={15} /></button></div>}
      </section>
      <details className="catalog-help"><summary>How catalogs work</summary><p>Add products here, then select this catalog in a DM reply or AI automation. AI uses your saved details. Photo replies appear as swipeable cards, with up to 10 photos per message.</p></details>
    </>}
    {panel?.type === 'new' && <CatalogEditor key={scope + ':new'} onClose={() => setPanel(null)} onSave={saveCatalog} />}
    {panel?.type === 'settings' && <CatalogEditor key={scope + current.id} catalog={current} productCount={visible.length} onClose={() => setPanel(null)} onSave={saveCatalog} onDelete={current.id !== DEFAULT_ID ? deleteCatalog : undefined} />}
    {panel?.type === 'product' && <ProductEditor key={scope + ':' + (panel.product?.id || 'new')} workspaceId={scope} catalog={current} product={panel.product} onClose={() => setPanel(null)} onSave={saveProduct} onDelete={deleteProduct} />}
    {panel?.type === 'preview' && <CatalogDialog title="Customer preview" subtitle={current.name} onClose={() => setPanel(null)}><div className="catalog-preview-content"><CatalogPreview products={visible} /></div></CatalogDialog>}
  </div></div>;
};
