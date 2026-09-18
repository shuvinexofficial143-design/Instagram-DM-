import { createHmac, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || 'https://mgibujqljahrfwlaafjy.supabase.co'
).replace(/\/$/, '');

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyMetaSignature(rawBody: Buffer, signatureHeader: string, appSecret: string) {
  if (!signatureHeader || !appSecret) return false;

  const expected =
    'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');

  try {
    const received = Buffer.from(signatureHeader);
    const target = Buffer.from(expected);
    return received.length === target.length && timingSafeEqual(received, target);
  } catch {
    return false;
  }
}

async function forwardToLiveProcessor(event: any, openaiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/instagram-live-webhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          // Server-to-server only. Never returned to the browser or logged.
          openaiKey,
        }),
        signal: controller.signal,
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(
        payload?.error ||
          `Live webhook processor failed (HTTP ${response.status})`
      );
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req: any, res: any) {
  const verifyToken = String(
    process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || ''
  ).trim();
  const appSecret = String(process.env.INSTAGRAM_APP_SECRET || '').trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (req.method === 'GET') {
    if (String(req.query?.check || '') === '1') {
      return res.status(200).json({
        ok: true,
        webhookEndpoint: '/api/webhook',
        verifyTokenConfigured: Boolean(verifyToken),
        appSecretConfigured: Boolean(appSecret),
        openaiConfigured: Boolean(openaiKey),
        liveProcessor: 'instagram-live-webhook',
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
    let rawBody: Buffer;

    try {
      rawBody = await readRawBody(req);
    } catch (err) {
      console.error('[META_WEBHOOK] Could not read raw body', err);
      return res.status(400).json({ received: false });
    }

    const signature = String(req.headers?.['x-hub-signature-256'] || '').trim();

    if (!appSecret) {
      console.error('[META_WEBHOOK] INSTAGRAM_APP_SECRET is missing');
      return res.status(503).json({ received: false });
    }

    if (!verifyMetaSignature(rawBody, signature, appSecret)) {
      console.error('[META_WEBHOOK] Invalid Meta signature');
      return res.status(403).json({ received: false });
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8') || '{}');
    } catch {
      console.error('[META_WEBHOOK] Invalid JSON payload');
      return res.status(400).json({ received: false });
    }

    console.log('[META_WEBHOOK] Verified event received', {
      object: event?.object || null,
      entries: Array.isArray(event?.entry) ? event.entry.length : 0,
    });

    if (!openaiKey) {
      // Acknowledge Meta so it does not retry forever, but log the exact reason
      // the AI reply could not be generated.
      console.error(
        '[LIVE_DM_AI] OPENAI_API_KEY is missing in Vercel; event acknowledged without AI reply'
      );
      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'openai_key_missing',
      });
    }

    try {
      const result = await forwardToLiveProcessor(event, openaiKey);

      console.log('[LIVE_DM_AI] Processor complete', {
        processed: result?.processed || 0,
        sent: result?.sent || 0,
        results: Array.isArray(result?.results)
          ? result.results.map((item: any) => ({
              messageId: item?.messageId || null,
              ok: item?.ok,
              sent: item?.sent || false,
              duplicate: item?.duplicate || false,
              ignored: item?.ignored || false,
              reason: item?.reason || null,
              error: item?.error || null,
              fallbackUsed: item?.fallbackUsed || false,
            }))
          : [],
      });

      return res.status(200).json({
        received: true,
        processed: true,
        sent: result?.sent || 0,
      });
    } catch (err: any) {
      console.error('[LIVE_DM_AI] Processor failed', err?.message || err);

      // Still acknowledge Meta; the failure is now visible in Vercel logs and
      // the user can retry by sending a new DM without webhook retry storms.
      return res.status(200).json({
        received: true,
        processed: false,
        reason: 'processor_failed',
      });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).send('Method Not Allowed');
}
