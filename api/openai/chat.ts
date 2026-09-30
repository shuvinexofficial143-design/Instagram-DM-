import { enforceRateLimit, resolveAiIdentity } from '../_auth';
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = 'gpt-4o-mini';
function cleanHistory(value: any): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-12)
    .map((item: any) => {
      const role =
        item?.role === 'assistant' || item?.sender === 'ai' || item?.sender === 'assistant'
          ? 'assistant'
          : 'user';
      const content = String(item?.content ?? item?.text ?? '').trim().slice(0, 4000);
      return content ? { role, content } : null;
    })
    .filter(Boolean) as Array<{ role: 'user' | 'assistant'; content: string }>;
}

function maxTokensForLength(length: unknown): number {
  const normalized = String(length || '').toLowerCase();
  if (normalized === 'long') return 320;
  if (normalized === 'medium') return 180;
  return 90;
}

export default async function handler(req: any, res: any) {
  const isHealthCheck = req.method === 'GET' && String(req.query?.check || '') === '1';
  if (req.method !== 'POST' && !isHealthCheck) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const identity = await resolveAiIdentity(req, true);
  if (!identity) {
    return res.status(401).json({
      ok: false,
      error: 'Authentication or a valid connected Instagram workspace is required.',
    });
  }

  const rate = enforceRateLimit(identity.key + ':openai-chat', isHealthCheck ? 20 : 30, 60_000);
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfter));
    return res.status(429).json({ ok: false, error: 'Too many AI requests. Please try again shortly.' });
  }

  if (isHealthCheck) {
    return res.status(200).json({
      ok: true,
      model: OPENAI_MODEL,
      endpoint: '/api/openai/chat',
    });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'OPENAI_API_KEY is not configured in Vercel.',
      code: 'OPENAI_KEY_MISSING',
    });
  }

  const input = String(req.body?.text || '').trim();
  if (!input) {
    return res.status(400).json({ ok: false, error: 'Message text is required.' });
  }

  const systemInstruction = String(
    req.body?.systemInstruction ||
      'You are a helpful Instagram DM assistant. Reply naturally, briefly, and only about the business.'
  )
    .trim()
    .slice(0, 12000);

  const language = String(req.body?.language || 'Auto Detect');
  const personality = String(req.body?.personality || 'Friendly');
  const assistantName = String(req.body?.assistantName || 'Sales Assistant');

  const systemContent = [
    systemInstruction,
    `Assistant name: ${assistantName}.`,
    `Tone/personality: ${personality}.`,
    language !== 'Auto Detect'
      ? `Reply in ${language} unless the user explicitly asks for another language.`
      : 'Automatically reply in the language used by the customer.',
    'This is an Instagram DM conversation. Keep the answer concise, natural, helpful, and suitable for chat.',
  ].join('\n');

  const history = cleanHistory(req.body?.history);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemContent },
          ...history,
          { role: 'user', content: input.slice(0, 6000) },
        ],
        temperature: 0.45,
        max_tokens: maxTokensForLength(req.body?.maxReplyLength),
      }),
      signal: controller.signal,
    });

    const payload = await openaiResponse.json().catch(() => null);

    if (!openaiResponse.ok) {
      console.error('[OPENAI_CHAT_ERROR]', openaiResponse.status, payload?.error || payload);
      return res.status(openaiResponse.status).json({
        ok: false,
        error: payload?.error?.message || 'OpenAI request failed.',
        code: payload?.error?.code || 'OPENAI_REQUEST_FAILED',
      });
    }

    const reply = String(payload?.choices?.[0]?.message?.content || '').trim();
    if (!reply) {
      return res.status(502).json({
        ok: false,
        error: 'GPT-4o mini returned an empty response.',
      });
    }

    return res.status(200).json({
      ok: true,
      model: payload?.model || OPENAI_MODEL,
      reply,
      usage: payload?.usage
        ? {
            prompt_tokens: payload.usage.prompt_tokens,
            completion_tokens: payload.usage.completion_tokens,
            total_tokens: payload.usage.total_tokens,
          }
        : undefined,
    });
  } catch (err: any) {
    console.error('[OPENAI_CHAT_FATAL]', err);
    return res.status(500).json({
      ok: false,
      error:
        err?.name === 'AbortError'
          ? 'OpenAI request timed out. Please try again.'
          : err?.message || 'OpenAI request failed.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
