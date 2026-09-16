from pathlib import Path
import json, shutil

ROOT = Path(__file__).resolve().parents[1]

# Ensure Vite's import.meta.env typing is available to TypeScript.
(ROOT / 'src/vite-env.d.ts').write_text('/// <reference types="vite/client" />\n', encoding='utf-8')

# Repoint frontend runtime imports to the Supabase adapter and clean Firebase-specific labels.
for path in list((ROOT / 'src').rglob('*.ts')) + list((ROOT / 'src').rglob('*.tsx')):
    if path.name == 'firebase.ts':
        continue
    text = path.read_text(encoding='utf-8')
    text = text.replace("./lib/firebase", "./lib/supabase")
    text = text.replace("../lib/firebase", "../lib/supabase")
    text = text.replace("../../lib/firebase", "../../lib/supabase")
    text = text.replace('isFirebaseInitialized', 'isSupabaseInitialized')
    text = text.replace('Firebase ID token', 'Supabase access token')
    text = text.replace('verified Firebase UID', 'verified Supabase user ID')
    text = text.replace('Firebase identity', 'Supabase identity')
    text = text.replace('verified Firebase UID', 'verified Supabase user ID')
    text = text.replace('Firebase signed out', 'Supabase signed out')
    text = text.replace('Firebase Auth State Changes', 'Supabase Auth State Changes')
    text = text.replace('[FIREBASE_REDIRECT_SUCCESS]', '[SUPABASE_REDIRECT_SUCCESS]')
    text = text.replace('[FIREBASE_REDIRECT_ERROR]', '[SUPABASE_REDIRECT_ERROR]')
    path.write_text(text, encoding='utf-8')

# Remove Firebase runtime dependencies, leaving Supabase as the only auth/database client.
pkg_path = ROOT / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
deps = pkg.setdefault('dependencies', {})
deps['@supabase/supabase-js'] = '^2.57.4'
deps.pop('firebase', None)
deps.pop('firebase-admin', None)
pkg_path.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

# Remove Firebase source/config/runtime files.
for rel in [
    'src/lib/firebase.ts',
    'firebase-applet-config.json',
    'firebase-blueprint.json',
    'firebase.json',
    'firestore.rules',
]:
    p = ROOT / rel
    if p.exists():
        p.unlink()

functions_dir = ROOT / 'functions'
if functions_dir.exists():
    shutil.rmtree(functions_dir)

# Remove migration/diagnostic leftovers; normal CI remains.
for rel in [
    '.github/workflows/migrate-firebase-to-supabase-once.yml',
    '.github/workflows/supabase-ts-diagnostics.yml',
    '.github/workflows/update-supabase-lock-once.yml',
    'scripts/migrate_firebase_to_supabase.py',
    'scripts/add_supabase_tokens_migration.py',
    'supabase-ts-errors.txt',
]:
    p = ROOT / rel
    if p.exists():
        p.unlink()

print('Final Supabase migration cleanup applied.')
