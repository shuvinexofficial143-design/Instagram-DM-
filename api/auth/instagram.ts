import {
  createOAuthState,
  getInstagramRedirectUri,
  getOrCreateGuestWorkspaceId,
  metaAppId,
  metaAppSecret,
} from '../../src/server/instagramVercel';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!metaAppId || !metaAppSecret) {
    return res.status(503).json({
      error: 'Instagram OAuth is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in Vercel.',
    });
  }

  const workspaceId = getOrCreateGuestWorkspaceId(req, res);
  const redirectUri = getInstagramRedirectUri(req);
  const state = createOAuthState(workspaceId);
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
    'instagram_business_content_publish',
  ].join(',');

  const params = new URLSearchParams({
    client_id: metaAppId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  });

  return res.status(200).json({
    url: `https://www.instagram.com/oauth/authorize?${params.toString()}`,
  });
}
