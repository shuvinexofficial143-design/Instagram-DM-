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
  const productionOrigin = String(process.env.APP_URL || 'https://autoreplys.vercel.app').replace(/\/+$/, '');
  const expectedRedirectUri = productionOrigin + '/api/auth/instagram/callback';

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
        : expectedRedirectUri,
    expectedRedirectUri,
    productionOrigin,
  });
}
