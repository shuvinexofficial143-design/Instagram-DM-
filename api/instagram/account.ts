import {
  deleteInstagramAccount,
  getAuthenticatedSupabaseUser,
  loadInstagramAccount,
  toClientSafeAccount,
} from '../../src/server/instagramVercel';

// Dedicated Vercel function for the authenticated user's connected Instagram account.
export default async function handler(req: any, res: any) {
  const user = await getAuthenticatedSupabaseUser(req);
  if (!user?.id) {
    return res.status(401).json({ success: false, account: null, error: 'Authentication required' });
  }

  if (req.method === 'GET') {
    try {
      const account = await loadInstagramAccount(user.id);
      return res.status(200).json({
        success: true,
        account: toClientSafeAccount(account),
      });
    } catch (err) {
      console.error('[INSTAGRAM_ACCOUNT_LOAD_FAILED]', err);
      return res.status(500).json({ success: false, account: null });
    }
  }

  if (req.method === 'POST') {
    if (req.body && 'account' in req.body && req.body.account === null) {
      try {
        await deleteInstagramAccount(user.id);
        return res.status(200).json({ success: true, account: null });
      } catch (err) {
        console.error('[INSTAGRAM_ACCOUNT_DELETE_FAILED]', err);
        return res.status(500).json({ success: false, error: 'Could not disconnect account' });
      }
    }

    return res.status(405).json({
      success: false,
      error: 'Manual Instagram connection is disabled. Use the official Meta OAuth flow.',
    });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method Not Allowed');
}
