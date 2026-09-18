function projectRefFromUrl(value: string): string {
  try {
    const host = new URL(value).hostname;
    return host.split('.')[0] || '';
  } catch {
    return '';
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const serverUrl = 'https://dwgxmmftybxwpurgsxkx.supabase.co';

  const viteUrl = String(process.env.VITE_SUPABASE_URL || '').trim();

  return res.status(200).json({
    ok: true,
    serverSupabaseProjectRef: projectRefFromUrl(serverUrl),
    serverSupabaseSource: 'fixed production project',
    viteSupabaseProjectRef: viteUrl ? projectRefFromUrl(viteUrl) : null,
    viteSupabaseSource: viteUrl ? 'VITE_SUPABASE_URL env' : 'not set at runtime',
    expectedRepoFallbackRef: 'dwgxmmftybxwpurgsxkx',
  });
}
