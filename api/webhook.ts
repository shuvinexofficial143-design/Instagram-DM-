export default function handler(req: any, res: any) {
  const verifyToken = String(
    process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || ''
  ).trim();

  if (req.method === 'GET') {
    // Small deployment/config health check without exposing the secret.
    if (String(req.query?.check || '') === '1') {
      return res.status(200).json({
        ok: true,
        webhookEndpoint: '/api/webhook',
        verifyTokenConfigured: Boolean(verifyToken),
        verifyTokenLength: verifyToken.length,
      });
    }

    const mode = String(req.query?.['hub.mode'] || '');
    const token = String(req.query?.['hub.verify_token'] || '');
    const challenge = String(req.query?.['hub.challenge'] || '');

    if (!verifyToken) {
      console.error('[WEBHOOK_VERIFY] WEBHOOK_VERIFY_TOKEN is not configured');
      return res.status(503).send('Webhook verification token is not configured');
    }

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[WEBHOOK_VERIFY] Meta webhook verified successfully');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(challenge);
    }

    console.warn('[WEBHOOK_VERIFY] Verification failed', {
      mode,
      receivedTokenLength: token.length,
      expectedTokenLength: verifyToken.length,
    });
    return res.status(403).send('Forbidden');
  }

  if (req.method === 'POST') {
    // Acknowledge Meta deliveries for now. Full automation processing remains
    // implemented in server.ts and can be moved into this Vercel function next.
    console.log('[META_WEBHOOK] Event received by Vercel function');
    return res.status(200).json({ received: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method Not Allowed');
}
