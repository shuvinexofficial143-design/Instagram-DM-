from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path: str, old: str, new: str, label: str):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Missing expected pattern for {label} in {path}')
    text = text.replace(old, new, 1)
    p.write_text(text, encoding='utf-8')
    print(f'updated: {label}')

# 1) Make OAuth redirect independent from stale Vercel env values.
replace_once(
    'src/lib/supabase.ts',
    """function getAuthRedirectUrl(): string {\n  if (typeof window !== 'undefined') {\n    const { hostname, origin } = window.location;\n    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {\n      return origin.replace(/\\/+$/, '');\n    }\n  }\n\n  const configured = (viteEnv.VITE_SITE_URL || viteEnv.VITE_APP_URL || '').trim();\n  if (configured && !/^https?:\\/\\/(localhost|127\\.0\\.0\\.1)(?::\\d+)?(?:\\/|$)/i.test(configured)) {\n    return configured.replace(/\\/+$/, '');\n  }\n\n  return PRODUCTION_SITE_URL;\n}\n""",
    """function getAuthRedirectUrl(): string {\n  if (typeof window !== 'undefined') {\n    const { hostname, origin } = window.location;\n\n    // Production must never inherit a stale localhost URL from deployment env.\n    if (hostname === 'instagram-dm-sable.vercel.app') return PRODUCTION_SITE_URL;\n\n    // Keep Vercel preview deployments on their own HTTPS origin when explicitly used.\n    if (hostname.endsWith('.vercel.app')) return origin.replace(/\\/+$/, '');\n  }\n\n  // OAuth for this deployed app always returns to the live site.\n  return PRODUCTION_SITE_URL;\n}\n""",
    'hard production auth redirect',
)

# 2) Do not fake a signed-in session when Supabase email confirmation is still pending.
replace_once(
    'src/lib/supabase.ts',
    """export async function createUserWithEmailAndPassword(_auth: typeof auth, email: string, password: string) {\n  const { data, error } = await supabase.auth.signUp({\n    email,\n    password,\n    options: { emailRedirectTo: getAuthRedirectUrl() },\n  });\n  if (error) throw error;\n  const user = toCompatUser(data.user, data.session);\n  auth.currentUser = user;\n  if (!user) throw new Error('Account was created, but no user session was returned. Check your email to confirm the account.');\n  return { user };\n}\n""",
    """export async function createUserWithEmailAndPassword(_auth: typeof auth, email: string, password: string) {\n  const cleanName = email.split('@')[0] || 'Account';\n  const { data, error } = await supabase.auth.signUp({\n    email,\n    password,\n    options: {\n      emailRedirectTo: getAuthRedirectUrl(),\n      data: { full_name: cleanName, name: cleanName },\n    },\n  });\n  if (error) throw error;\n\n  if (!data.session) {\n    auth.currentUser = null;\n    const confirmationError: any = new Error(\n      'Account created. Please confirm your email, then sign in.'\n    );\n    confirmationError.code = 'auth/email-confirmation-required';\n    throw confirmationError;\n  }\n\n  const user = toCompatUser(data.user, data.session);\n  auth.currentUser = user;\n  if (!user) throw new Error('Account was created, but no authenticated user was returned.');\n  return { user };\n}\n""",
    'email signup session safety',
)

# 3) Login page: show email-confirmation success instead of opening dashboard with placeholder profile.
replace_once(
    'src/components/Auth/LoginPage.tsx',
    """    } catch (err: any) {\n      if (err?.code === 'auth/email-already-in-use') {\n""",
    """    } catch (err: any) {\n      if (err?.code === 'auth/email-confirmation-required') {\n        setSuccessMsg('Account created. Check your email to confirm it, then come back and Sign In.');\n        setAuthMode('signin');\n        setPassword('');\n        setConfirmPassword('');\n      } else if (err?.code === 'auth/email-already-in-use') {\n""",
    'email confirmation UX',
)

# 4) Remove generic/random avatar fallbacks and stale Creator profile behavior.
replace_once(
    'src/context/AppContext.tsx',
    """    name: 'Creator',\n""",
    """    name: 'Account',\n""",
    'default profile name',
)

p = ROOT / 'src/context/AppContext.tsx'
text = p.read_text(encoding='utf-8')
text = text.replace(
    "avatar_url: result.user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${result.user.uid}`,",
    "avatar_url: result.user.photoURL || '',",
)
text = text.replace(
    "avatar_url: currUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currUser.uid}`,",
    "avatar_url: currUser.photoURL || '',",
)
text = text.replace("sessionStorage.removeItem('firebase_redirect_pending')", "sessionStorage.removeItem('supabase_redirect_pending')")
text = text.replace('[FIREBASE_REDIRECT_CHECK_WARN]', '[SUPABASE_REDIRECT_CHECK_WARN]')
text = text.replace('not authorized in Firebase Console -> Authentication -> Settings -> Authorized Domains!', 'not allowed by Supabase Auth redirect settings.')
old = """      } else {\n        setFirebaseUser(null);\n        setInstagramAccountState(null);\n      }\n"""
new = """      } else {\n        setFirebaseUser(null);\n        setInstagramAccountState(null);\n        setUser({\n          id: '',\n          name: 'Account',\n          email: '',\n          avatar_url: '',\n          plan: 'pro',\n          trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),\n          created_at: new Date().toISOString(),\n        });\n      }\n"""
if old not in text:
    raise RuntimeError('Missing signed-out profile reset pattern')
text = text.replace(old, new, 1)
p.write_text(text, encoding='utf-8')
print('updated: AppContext profile identity')

# 5) Sidebar bottom card must represent the signed-in website account, not Instagram channel/default Creator.
p = ROOT / 'src/components/Sidebar.tsx'
text = p.read_text(encoding='utf-8')
anchor = """  const isTrial = user?.plan === 'trial' || user?.plan === 'free';\n\n"""
insert = """  const isTrial = user?.plan === 'trial' || user?.plan === 'free';\n  const accountName =\n    firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || user?.name || 'Account';\n  const accountEmail = firebaseUser?.email || user?.email || '';\n  const accountPhoto = firebaseUser?.photoURL || user?.avatar_url || '';\n\n"""
if anchor not in text:
    raise RuntimeError('Missing Sidebar account anchor')
text = text.replace(anchor, insert, 1)
old_card = """              <UserAvatar\n                src={instagramAccount?.profile_pic_url || user.avatar_url}\n                username={instagramAccount?.username || user.name}\n                showInstagramBadge={Boolean(instagramAccount?.username)}\n                size=\"md\"\n              />\n              {!isCollapsed && (\n                <div className=\"min-w-0\">\n                  <p className=\"text-xs font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors\">\n                    {instagramAccount?.username ? `@${instagramAccount.username}` : user.name}\n                  </p>\n                  <div className=\"flex items-center gap-1 text-[10px] text-slate-500\">\n                    <ShieldCheck className=\"w-3 h-3 text-emerald-500 shrink-0\" />\n                    <span className=\"capitalize font-semibold text-emerald-700\">\n                      {instagramAccount ? 'Live Channel' : `${user.plan} Plan`}\n                    </span>\n                  </div>\n                </div>\n              )}\n"""
new_card = """              <UserAvatar\n                src={accountPhoto}\n                name={accountName}\n                size=\"md\"\n              />\n              {!isCollapsed && (\n                <div className=\"min-w-0\">\n                  <p className=\"text-xs font-black text-slate-950 truncate group-hover:text-indigo-600 transition-colors\">\n                    {accountName}\n                  </p>\n                  <p className=\"mt-0.5 text-[10px] font-semibold text-slate-600 truncate\" title={accountEmail}>\n                    {accountEmail || `${user.plan} plan`}\n                  </p>\n                </div>\n              )}\n"""
if old_card not in text:
    raise RuntimeError('Missing Sidebar profile card pattern')
text = text.replace(old_card, new_card, 1)
text = text.replace('<span>{user.name}</span>', '<span>{accountName}</span>', 1)
text = text.replace(
    '<span className="text-[10px] text-emerald-400 font-normal capitalize">{user.plan} Plan</span>',
    '<span className="text-[10px] text-slate-300 font-normal">{accountEmail || `${user.plan} Plan`}</span>',
    1,
)
p.write_text(text, encoding='utf-8')
print('updated: Sidebar signed-in identity')

# 6) Response page: use the softer About-page visual language instead of stark black/white.
p = ROOT / 'src/components/Automations/AutomationBuilder.tsx'
text = p.read_text(encoding='utf-8')
old = """          <div className={`overflow-y-auto p-6 space-y-6 ${\n            currentStep === 2 ? 'w-full lg:w-[65%] flex-1' : 'w-full flex-1'\n          }`}>\n"""
new = """          <div className={`overflow-y-auto p-6 space-y-6 ${\n            currentStep === 2\n              ? 'w-full lg:w-[65%] flex-1 automation-response-theme'\n              : 'w-full flex-1 bg-white'\n          }`}>\n"""
if old not in text:
    raise RuntimeError('Missing AutomationBuilder left column pattern')
text = text.replace(old, new, 1)
old_right = """            <div className=\"hidden lg:flex lg:w-[35%] bg-slate-950 p-5 flex-col items-center justify-center shrink-0 border-l border-slate-800 space-y-3 overflow-y-auto lg:sticky lg:top-0 h-full\">\n"""
new_right = """            <div className=\"hidden lg:flex lg:w-[35%] bg-gradient-to-b from-[#EEF4FF] via-[#F8F5FF] to-[#F3F0FF] p-5 flex-col items-center justify-center shrink-0 border-l border-indigo-100 space-y-3 overflow-y-auto lg:sticky lg:top-0 h-full\">\n"""
if old_right not in text:
    raise RuntimeError('Missing AutomationBuilder simulator column pattern')
text = text.replace(old_right, new_right, 1)
p.write_text(text, encoding='utf-8')
print('updated: Automation response visual theme')

# 7) Improve global crispness/contrast and add scoped response-page theming.
p = ROOT / 'src/index.css'
text = p.read_text(encoding='utf-8')
text = text.replace(
    """    -webkit-font-smoothing: auto;\n    -moz-osx-font-smoothing: auto;\n    text-rendering: auto;\n""",
    """    -webkit-font-smoothing: antialiased;\n    -moz-osx-font-smoothing: grayscale;\n    text-rendering: optimizeLegibility;\n""",
    1,
)
if '/* Human-style response builder theme */' not in text:
    text += """

/* Human-style response builder theme */
.automation-response-theme {
  position: relative;
  background:
    radial-gradient(circle at 8% 8%, rgba(147, 197, 253, 0.22), transparent 28%),
    radial-gradient(circle at 92% 18%, rgba(196, 181, 253, 0.25), transparent 30%),
    linear-gradient(135deg, #f7faff 0%, #fbf9ff 52%, #f6f2ff 100%);
}

.automation-response-theme::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0));
}

.automation-response-theme > * {
  position: relative;
  z-index: 1;
}

.automation-response-theme [class*="bg-white"] {
  background-color: rgba(255, 255, 255, 0.96) !important;
}

.automation-response-theme [class*="text-slate-500"] {
  color: #475569 !important;
}

.automation-response-theme [class*="text-slate-400"] {
  color: #64748b !important;
}

.automation-response-theme input,
.automation-response-theme textarea,
.automation-response-theme select {
  background: #ffffff !important;
  color: #0f172a !important;
  border-color: #c7d2fe !important;
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.06);
}

.automation-response-theme input:focus,
.automation-response-theme textarea:focus,
.automation-response-theme select:focus {
  border-color: #818cf8 !important;
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.14) !important;
}

#root {
  min-height: 100vh;
  color: #0f172a;
}
"""
p.write_text(text, encoding='utf-8')
print('updated: global crispness and contrast')

print('All requested fixes patched successfully.')
