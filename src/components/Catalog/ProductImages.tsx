import React, { useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { uploadCatalogImages } from '../../lib/catalogs';

export function ProductImages({ workspaceId, catalogId, images, onChange, onBusy, disabled = false }: {
  workspaceId: string; catalogId: string; images: string[]; onChange: (images: string[]) => void; onBusy?: (busy: boolean) => void; disabled?: boolean;
}) {
  const mounted = useRef(true), lock = useRef(false), input = useRef<HTMLInputElement>(null);
  const callbacks = useRef({ onChange, onBusy });
  callbacks.current = { onChange, onBusy };
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [dragging, setDragging] = useState(false);
  const id = useId();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; callbacks.current.onBusy?.(false); }; }, []);
  const upload = async (files: File[]) => {
    if (!files.length || lock.current || disabled) return;
    setError(''); setDragging(false);
    if (images.length + files.length > 10) { setError('Choose up to 10 images per product.'); return; }
    lock.current = true; setBusy(true); callbacks.current.onBusy?.(true);
    try {
      const urls = await uploadCatalogImages(workspaceId, catalogId, files);
      if (mounted.current) callbacks.current.onChange([...images, ...urls]);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Upload failed. Please retry.'); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); callbacks.current.onBusy?.(false); } }
  };
  return <section className="catalog-images" aria-label="Product photos" aria-busy={busy}>
    <div className="catalog-images-heading"><strong>Product photos <span className="catalog-optional">Optional</span></strong><span>{images.length}/10</span></div>
    {images.length > 0 && <div className="catalog-thumbnails">{images.map((url, i) => <div key={url + i} className="catalog-thumbnail"><img src={url} alt={`Product photo ${i + 1}`} />{i === 0 && <span>Cover</span>}<button disabled={busy || disabled} type="button" aria-label={`Remove image ${i + 1}`} onClick={() => onChange(images.filter((_, index) => index !== i))}><X size={16} /></button></div>)}</div>}
    <input ref={input} id={id} type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy || disabled || images.length >= 10} aria-label="Upload product images" className="catalog-sr-only" tabIndex={-1} onChange={e => { void upload(Array.from(e.target.files || [])); e.target.value = ''; }} />
    {images.length < 10 && <button type="button" className={`catalog-dropzone ${dragging ? 'is-dragging' : ''}`} disabled={busy || disabled} aria-controls={id} onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); if (!busy && !disabled) setDragging(true); }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={e => { e.preventDefault(); void upload(Array.from(e.dataTransfer.files)); }}>
      <span className="catalog-upload-icon">{busy ? <Loader2 size={24} className="catalog-spin" /> : <ImagePlus size={25} />}</span>
      <strong>{busy ? 'Uploading photos…' : images.length ? 'Add more photos' : 'Drop photos here or tap to upload'}</strong><span>JPG, PNG or WebP · Up to 5 MB each</span>
    </button>}
    {error && <p role="alert" className="catalog-upload-error">{error}</p>}
  </section>;
}
