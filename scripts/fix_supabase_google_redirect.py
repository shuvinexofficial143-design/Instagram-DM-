from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

supabase_path = ROOT / 'src/lib/supabase.ts'
text = supabase_path.read_text(encoding='utf-8')

anchor = "const SUPABASE_PUBLISHABLE_KEY =\n  viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Eae4_ClutOufXa5U2vo6MA_nhnOL8D7';\n"
helper = """const SUPABASE_PUBLISHABLE_KEY =
  viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_Eae4_ClutOufXa5U2vo6MA_nhnOL8D7';

const PRODUCTION_SITE_URL = 'https://shuvinex.online';

function getAuthRedirectUrl(): string {
  const configured = (viteEnv.VITE_SITE_URL || viteEnv.VITE_APP_URL || '').trim();
  if (configured) return configured.replace(/\\/+$/, '');

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      return origin.replace(/\\/+$/, '');
    }
  }

  return PRODUCTION_SITE_URL;
}
"""

if anchor in text and 'function getAuthRedirectUrl()' not in text:
    text = text.replace(anchor, helper, 1)

text = text.replace("redirectTo: window.location.origin,", "redirectTo: getAuthRedirectUrl(),")
text = text.replace("options: { emailRedirectTo: window.location.origin },", "options: { emailRedirectTo: getAuthRedirectUrl() },")

supabase_path.write_text(text, encoding='utf-8')

login_path = ROOT / 'src/components/Auth/LoginPage.tsx'
login = login_path.read_text(encoding='utf-8')
login = login.replace("firebase_redirect_pending", "supabase_redirect_pending")
login = login.replace("not authorized in Firebase Console", "not allowed by Supabase Auth redirect settings")
login = login.replace("Firebase Console → Authentication → Settings → Authorized domains.", "Supabase → Authentication → URL Configuration → Redirect URLs.")
login = login.replace("Email/password authentication is not enabled in Firebase Console.", "Email/password authentication is not enabled in Supabase Auth.")
login_path.write_text(login, encoding='utf-8')

print('Supabase Google redirect fix applied.')
