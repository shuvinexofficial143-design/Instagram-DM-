import {
  deleteInstagramAccount,
  getGuestWorkspaceId,
  loadInstagramAccount,
  toClientSafeAccount,
} from '../../src/server/instagramVercel';

// Dedicated Vercel function for the browser's connected-account status.
export default async function handler(req: any, res: any) {
  const workspaceId = getGuestWorkspaceId(req);

  if (req.method === 'GET') {
    if (!workspaceId) {
      return res.status(200).json({ success: true, account: null });
    }

    try {
      const account = await loadInstagramAccount(workspaceId);
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
    if (!workspaceId) {
      return res.status(200).json({ success: true, account: null });
    }

    if (req.body && 'account' in req.body && req.body.account === null) {
      try {
        await deleteInstagramAccount(workspaceId);
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
