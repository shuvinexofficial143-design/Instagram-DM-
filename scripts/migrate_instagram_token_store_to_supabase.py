from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
path = root / 'server.ts'
text = path.read_text(encoding='utf-8')

text = text.replace(
    "import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';",
    "import { createClient as createSupabaseClient } from '@supabase/supabase-js';",
    1,
)

old_admin = '''let adminDb: ReturnType<typeof getAdminFirestore> | null = null;
try {
  // server-security-bootstrap.mjs initializes the Firebase Admin default app before server.ts.
  // Admin Firestore bypasses client rules and keeps OAuth tokens out of browser-readable paths.
  adminDb = getAdminFirestore();
} catch (err) {
  console.warn('[ADMIN_FIRESTORE_INIT_WARN] Server-only token persistence unavailable; using in-memory fallback.', err);
}
'''
new_admin = '''const serverSupabaseUrl = process.env.SUPABASE_URL || 'https://jnrftwolkhkuvpsbvbww.supabase.co';
const serverSupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const serverSupabase = serverSupabaseServiceKey
  ? createSupabaseClient(serverSupabaseUrl, serverSupabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!serverSupabase) {
  console.warn('[SUPABASE_SERVICE_ROLE_MISSING] Instagram OAuth tokens will use in-memory fallback until SUPABASE_SERVICE_ROLE_KEY is configured.');
}
'''
if old_admin not in text:
    raise RuntimeError('adminDb initialization block not found')
text = text.replace(old_admin, new_admin, 1)

pattern = re.compile(r'''  async function persistServerInstagramAccount\(userId: string, account: InstagramAccount\) \{.*?\n  \}\n\n  async function loadServerInstagramAccount\(userId: string\): Promise<InstagramAccount \| null> \{.*?\n  \}\n\n  async function deleteServerInstagramAccount\(userId: string\) \{.*?\n  \}\n''', re.S)
replacement = '''  async function persistServerInstagramAccount(userId: string, account: InstagramAccount) {
    const cleanAccount: InstagramAccount = {
      ...account,
      access_token: sanitizeAccessToken(account.access_token || ''),
    };
    userInstagramAccountsMemory.set(userId, cleanAccount);
    connectedInstagramAccountMemory = cleanAccount;

    if (!serverSupabase) return;
    try {
      const { error: tokenError } = await serverSupabase
        .from('autoreply_instagram_tokens')
        .upsert({ user_id: userId, account: cleanAccount }, { onConflict: 'user_id' });
      if (tokenError) throw tokenError;

      const safeAccount = toClientSafeInstagramAccount(cleanAccount);
      const { error: metadataError } = await serverSupabase
        .from('autoreply_documents')
        .upsert(
          {
            user_id: userId,
            collection: 'instagram_account',
            id: 'primary',
            data: safeAccount,
          },
          { onConflict: 'user_id,collection,id' }
        );
      if (metadataError) throw metadataError;
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_PERSIST_WARN]', err);
    }
  }

  async function loadServerInstagramAccount(userId: string): Promise<InstagramAccount | null> {
    const cached = userInstagramAccountsMemory.get(userId);
    if (cached?.access_token) return cached;
    if (!serverSupabase) return cached || null;

    try {
      const { data, error } = await serverSupabase
        .from('autoreply_instagram_tokens')
        .select('account')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      const account = data?.account as InstagramAccount | undefined;
      if (!account?.username || !account?.access_token) return null;
      account.access_token = sanitizeAccessToken(account.access_token);
      userInstagramAccountsMemory.set(userId, account);
      connectedInstagramAccountMemory = account;
      return account;
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_LOAD_WARN]', err);
      return null;
    }
  }

  async function deleteServerInstagramAccount(userId: string) {
    userInstagramAccountsMemory.delete(userId);
    if (!serverSupabase) return;
    try {
      const [{ error: tokenError }, { error: metadataError }] = await Promise.all([
        serverSupabase.from('autoreply_instagram_tokens').delete().eq('user_id', userId),
        serverSupabase
          .from('autoreply_documents')
          .delete()
          .eq('user_id', userId)
          .eq('collection', 'instagram_account')
          .eq('id', 'primary'),
      ]);
      if (tokenError) throw tokenError;
      if (metadataError) throw metadataError;
    } catch (err) {
      console.warn('[SERVER_IG_ACCOUNT_DELETE_WARN]', err);
    }
  }
'''
text2, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise RuntimeError(f'Instagram token function block not found: {count}')

text2 = text2.replace('const SERVER_INSTAGRAM_TOKEN_COLLECTION = \'server_instagram_tokens\';\n', '', 1)
path.write_text(text2, encoding='utf-8')
print('Migrated Instagram token store to Supabase server-only storage.')
