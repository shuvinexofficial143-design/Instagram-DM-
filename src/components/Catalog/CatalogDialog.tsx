import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Native modal supplies focus trapping, Escape handling and focus restoration. */
export function CatalogDialog({ title, subtitle, onClose, busy = false, footer, children }: {
  title: string; subtitle?: string; onClose: () => void; busy?: boolean;
  footer?: React.ReactNode; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(), subtitleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = oldOverflow; };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={ref} className="catalog-dialog" aria-labelledby={titleId} aria-describedby={subtitle ? subtitleId : undefined} aria-busy={busy} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }} onClick={e => {
    if (e.target !== e.currentTarget || busy) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
  }}>
    <header className="catalog-dialog-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p id={subtitleId}>{subtitle}</p>}</div><button type="button" className="catalog-icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></header>
    <div className="catalog-dialog-body">{children}</div>
    {footer && <footer className="catalog-dialog-footer">{footer}</footer>}
  </dialog>, document.body);
}
