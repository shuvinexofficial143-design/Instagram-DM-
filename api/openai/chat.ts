const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = 'gpt-4o-mini';
const GUEST_COOKIE = 'autoreply_guest_workspace';

function getCookie(req: any, name: string): string {
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const value = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return '';
}

function isGuestWorkspace(value: string): boolean {
  return /^guest_[a-f0-9-]{16,}$/i.test(value);
}

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
  if (req.method === 'GET' && String(req.query?.check || '') === '1') {
    return res.status(200).json({
      ok: true,
      model: OPENAI_MODEL,
      apiKeyConfigured: Boolean(OPENAI_API_KEY),
      endpoint: '/api/openai/chat',
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({
      ok: false,
      error: 'OPENAI_API_KEY is not configured in Vercel.',
      code: 'OPENAI_KEY_MISSING',
    });
  }

  // Keep the paid OpenAI endpoint private to a browser that has connected an
  // Instagram workspace on this site. The secret API key never reaches the client.
  const workspaceId = getCookie(req, GUEST_COOKIE);
  if (!isGuestWorkspace(workspaceId)) {
    return res.status(401).json({
      ok: false,
      error: 'Connect Instagram before using DM AI Conversation.',
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
