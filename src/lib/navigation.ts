export const PUBLIC_SUPPORT_ROUTES = {
  '/help': 'help',
  '/help/faq': 'faq',
  '/help/billing': 'billing-help',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/contact': 'contact',
  '/refunds': 'refunds',
} as const;
export const publicSupportPage = (pathname: string) => PUBLIC_SUPPORT_ROUTES[pathname.replace(/\/+$/, '') as keyof typeof PUBLIC_SUPPORT_ROUTES];
