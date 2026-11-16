import React from 'react';
import { Image as ImageIcon, Truck, PackageCheck, Sparkles } from 'lucide-react';

/**
 * Customer-facing, ChatGPT-style product presentation inside the Auto Replys app.
 * This component renders verified catalog data only. It does not generate prices,
 * invent product images, or imply that Instagram supports arbitrary HTML cards.
 */
export type ProductShowcaseItem = {
  id?: string;
  image: string;
  title: string;
  price?: string;
  style?: string;
  description?: string;
  delivery?: string;
  cod?: string;
  customization?: string;
  subtitle?: string;
};

const savedPrice = (item: ProductShowcaseItem) =>
  item.price || (item.subtitle || '').match(/₹\s*[\d,]+(?:\.\d{1,2})?/u)?.[0] || '';
const isCodAvailable = (value: string) =>
  /(?:cod|cash on delivery|available|yes|उपलब्ध)/iu.test(value) && !/(?:not available|no cod|नहीं)/iu.test(value);
const freeDelivery = (value: string) => /free|मुफ्त|फ्री/iu.test(value);

export function ProductShowcase({
  items,
  compact = false,
  label = 'Verified product showcase',
}: {
  items: ProductShowcaseItem[];
  compact?: boolean;
  label?: string;
}) {
  const valid = items.filter(item => /^https:\/\//iu.test(item.image));
  if (!valid.length) return <p className="text-sm text-slate-500">No product photos available in this catalog.</p>;

  return (
    <section aria-label={label} className="w-full min-w-0">
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]" role="list">
        {valid.map((item, index) => {
          const price = savedPrice(item);
          const delivery = item.delivery || (item.subtitle || '').match(/(?:free delivery|[0-9]+\s*[-–]\s*[0-9]+\s*days?)/iu)?.[0] || '';
          const cod = item.cod || (/(?:\bCOD\b|cash on delivery)/iu.test(item.subtitle || '') ? 'COD' : '');
          return (
            <article role="listitem" key={(item.id || item.image) + ':' + index}
              className={'min-w-0 shrink-0 snap-start overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm ' +
                (compact ? 'w-56' : valid.length === 1 ? 'w-full max-w-sm' : 'w-64')}>
              <div className="border-b border-slate-100 px-3.5 py-3">
                <p className="line-clamp-2 text-sm font-bold leading-5">✨ {item.title}</p>
              </div>
              <div className="relative overflow-hidden bg-slate-50">
                <img src={item.image} alt={item.title} referrerPolicy="no-referrer" loading="lazy"
                  className="aspect-[4/5] w-full object-contain" />
                {item.style && <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2 py-1 text-[11px] font-bold shadow-sm">{item.style}</span>}
              </div>
              <div className="space-y-2.5 px-3.5 py-3.5">
                {price && <p className="text-xl font-extrabold tracking-tight">{price}</p>}
                {(delivery || cod) && <div className="flex flex-wrap gap-1.5">
                  {delivery && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"><Truck className="h-3.5 w-3.5"/>{freeDelivery(delivery) ? 'Free delivery' : delivery}</span>}
                  {isCodAvailable(cod) && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800"><PackageCheck className="h-3.5 w-3.5"/>COD</span>}
                </div>}
                {item.customization && <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-600"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-500"/>{item.customization}</p>}
                {item.description && <p className="line-clamp-2 text-xs leading-5 text-slate-500">{item.description}</p>}
                {!price && !delivery && !cod && !item.description && <p className="text-xs text-slate-400"><ImageIcon className="mr-1 inline h-3.5 w-3.5"/>Photo from your saved catalog</p>}
              </div>
            </article>
          );
        })}
      </div>
      {valid.length > 1 && <p className="text-xs text-slate-500">Swipe sideways to see {valid.length} available designs.</p>}
    </section>
  );
}
