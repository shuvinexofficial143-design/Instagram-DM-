export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method Not Allowed');
  }

  const appId = String(process.env.INSTAGRAM_APP_ID || '').trim();
  const appSecret = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const verifyToken = String(
    process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || ''
  ).trim();
  const redirectUri = String(process.env.REDIRECT_URI || '').trim();

  return res.status(200).json({
    ok: true,
    instagramAppIdConfigured: Boolean(appId),
    instagramAppSecretConfigured: Boolean(appSecret),
    supabaseServiceRoleConfigured: Boolean(serviceRole),
    webhookVerifyTokenConfigured: Boolean(verifyToken),
    redirectUriConfigured: Boolean(redirectUri),
    redirectUri:
      redirectUri && !redirectUri.includes('localhost')
        ? redirectUri
        : 'https://autoreplys.vercel.app/api/auth/instagram/callback',
    expectedRedirectUri:
      'https://autoreplys.vercel.app/api/auth/instagram/callback',
    productionOrigin: 'https://autoreplys.vercel.app',
  });
}
