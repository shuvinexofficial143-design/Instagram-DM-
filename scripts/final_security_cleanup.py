from pathlib import Path

root = Path(__file__).resolve().parents[1]
server_path = root / 'server.ts'
env_path = root / '.env.example'
text = server_path.read_text(encoding='utf-8')

def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, found {count}')
    text = text.replace(old, new, 1)

replace_once(
"""  const ADMIN_CREDENTIALS = {
    userId: 'Nazhalijing',
    password: 'nazha@9589',
  };
  const ADMIN_SESSION_SECRET = 'admin_session_valid_nazhalijing_9589';""",
"""  const ADMIN_CREDENTIALS = {
    userId: process.env.ADMIN_USER_ID || '',
    password: process.env.ADMIN_PASSWORD || '',
  };
  const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';""",
'admin credentials env-only'
)

replace_once(
"""    if (
      adminToken === ADMIN_SESSION_SECRET ||
      authHeader === `Bearer ${ADMIN_SESSION_SECRET}` ||
      authHeader === ADMIN_SESSION_SECRET
    ) {
      return true;
    }""",
"""    if (
      ADMIN_SESSION_SECRET &&
      (adminToken === ADMIN_SESSION_SECRET ||
        authHeader === `Bearer ${ADMIN_SESSION_SECRET}` ||
        authHeader === ADMIN_SESSION_SECRET)
    ) {
      return true;
    }""",
'empty admin secret must never authorize'
)

replace_once(
"""      const givenId = String(userId || username || '').trim();
      const givenPassword = String(password || '').trim();

      if (
        givenId.toLowerCase() === ADMIN_CREDENTIALS.userId.toLowerCase() &&
        givenPassword === ADMIN_CREDENTIALS.password
      ) {""",
"""      const givenId = String(userId || username || '').trim();
      const givenPassword = String(password || '').trim();

      if (!ADMIN_CREDENTIALS.userId || !ADMIN_CREDENTIALS.password || !ADMIN_SESSION_SECRET) {
        return res.status(503).json({
          success: false,
          error: 'Legacy admin credential login is not configured. Use Firebase admin access or configure server-only ADMIN_* variables.',
        });
      }

      if (
        givenId.toLowerCase() === ADMIN_CREDENTIALS.userId.toLowerCase() &&
        givenPassword === ADMIN_CREDENTIALS.password
      ) {""",
'admin login hard failure when unconfigured'
)

replace_once(
"""    const acceptedTokens = [
      metaConfigStore.webhook_verify_token,
      'autoreply_meta_verify_secret_token_2026',
      process.env.WEBHOOK_VERIFY_TOKEN,
      process.env.VERIFY_TOKEN,
    ].filter(Boolean);

    const isTokenValid = Boolean(
      token && (acceptedTokens.includes(String(token)) || acceptedTokens.length === 0)
    );""",
"""    const acceptedTokens = [
      metaConfigStore.webhook_verify_token,
      process.env.WEBHOOK_VERIFY_TOKEN,
      process.env.VERIFY_TOKEN,
    ].filter(Boolean);

    if (acceptedTokens.length === 0) {
      console.error('[WEBHOOK_VERIFICATION_CONFIG_ERROR] WEBHOOK_VERIFY_TOKEN is not configured.');
      return res.status(503).send('Webhook verification is not configured');
    }

    const isTokenValid = Boolean(token && acceptedTokens.includes(String(token)));""",
'webhook token env-only and fail closed'
)

server_path.write_text(text, encoding='utf-8')

env_text = env_path.read_text(encoding='utf-8')
marker = 'ADMIN_EMAILS="devsinghparmar9589@gmail.com"\n'
addition = '''ADMIN_EMAILS="devsinghparmar9589@gmail.com"\n\n# OPTIONAL LEGACY ADMIN LOGIN — server-only; prefer Firebase-authenticated admin access.\nADMIN_USER_ID=""\nADMIN_PASSWORD=""\nADMIN_SESSION_SECRET=""\n'''
if marker not in env_text:
    raise RuntimeError('ADMIN_EMAILS marker not found in .env.example')
env_text = env_text.replace(marker, addition, 1)
env_path.write_text(env_text, encoding='utf-8')

print('Final server credential cleanup applied.')
