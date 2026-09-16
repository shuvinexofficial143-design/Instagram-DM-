from pathlib import Path
import json, shutil

ROOT = Path(__file__).resolve().parents[1]

# Preserve the working Supabase compatibility layer under its correct name before deleting
# the legacy firebase.ts filename.
legacy_adapter = ROOT / 'src/lib/firebase.ts'
supabase_adapter = ROOT / 'src/lib/supabase.ts'
if legacy_adapter.exists():
    adapter_text = legacy_adapter.read_text(encoding='utf-8')
    adapter_text = adapter_text.replace('export const isFirebaseInitialized = true;', 'export const isSupabaseInitialized = true;')
    adapter_text = adapter_text.replace('FirestoreErrorInfo', 'DataStoreErrorInfo')
    adapter_text = adapter_text.replace('handleFirestoreError', 'handleDataStoreError')
    supabase_adapter.write_text(adapter_text, encoding='utf-8')
elif not supabase_adapter.exists():
    raise RuntimeError('Neither src/lib/firebase.ts nor src/lib/supabase.ts exists')

# Ensure Vite's import.meta.env typing is available to TypeScript.
(ROOT / 'src/vite-env.d.ts').write_text('/// <reference types="vite/client" />\n', encoding='utf-8')

# Repoint frontend runtime imports to the Supabase adapter and clean Firebase-specific labels.
for path in list((ROOT / 'src').rglob('*.ts')) + list((ROOT / 'src').rglob('*.tsx')):
    if path.name in {'firebase.ts', 'supabase.ts'}:
        continue
    text = path.read_text(encoding='utf-8')
    text = text.replace("./lib/firebase", "./lib/supabase")
    text = text.replace("../lib/firebase", "../lib/supabase")
    text = text.replace("../../lib/firebase", "../../lib/supabase")
    text = text.replace('isFirebaseInitialized', 'isSupabaseInitialized')
    text = text.replace('Firebase ID token', 'Supabase access token')
    text = text.replace('verified Firebase UID', 'verified Supabase user ID')
    text = text.replace('Firebase identity', 'Supabase identity')
    text = text.replace('Firebase signed out', 'Supabase signed out')
    text = text.replace('Firebase Auth State Changes', 'Supabase Auth State Changes')
    text = text.replace('[FIREBASE_REDIRECT_SUCCESS]', '[SUPABASE_REDIRECT_SUCCESS]')
    text = text.replace('[FIREBASE_REDIRECT_ERROR]', '[SUPABASE_REDIRECT_ERROR]')
    path.write_text(text, encoding='utf-8')

# Remove Firebase server SDK imports. The legacy DB branches were already disabled (db=null),
# so local no-op shims keep those old diagnostic paths compilable while all live data uses Supabase.
server_path = ROOT / 'server.ts'
server = server_path.read_text(encoding='utf-8')
old_imports = """import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  Firestore,
} from 'firebase/firestore';
"""
if old_imports in server:
    server = server.replace(old_imports, '', 1)

old_db = """// Firestore operations are handled securely on the client-side with authenticated user sessions (auth.currentUser).
// In Node server environment without user auth credentials, client-SDK Firestore writes are disabled to prevent unauthenticated PERMISSION_DENIED stream errors.
const db: Firestore | null = null;
"""
new_db = """// Legacy database branches are disabled. Active auth and user persistence use Supabase.
const db: any = null;
const collection = (..._args: any[]): any => ({});
const doc = (..._args: any[]): any => ({});
const setDoc = async (..._args: any[]): Promise<void> => {};
const getDoc = async (..._args: any[]): Promise<any> => ({ exists: () => false, data: () => null });
const getDocs = async (..._args: any[]): Promise<any> => ({ empty: true, size: 0, docs: [], forEach: (_fn: any) => {} });
const updateDoc = async (..._args: any[]): Promise<void> => {};
const deleteDoc = async (..._args: any[]): Promise<void> => {};
const query = (...args: any[]): any => args[0];
const where = (..._args: any[]): any => ({});
"""
if old_db in server:
    server = server.replace(old_db, new_db, 1)
server = server.replace('Firestore', 'legacy database')
server_path.write_text(server, encoding='utf-8')

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

# Remove old migration/diagnostic leftovers; normal CI remains.
for rel in [
    'scripts/migrate_firebase_to_supabase.py',
    'scripts/add_supabase_tokens_migration.py',
    'supabase-ts-errors.txt',
]:
    p = ROOT / rel
    if p.exists():
        p.unlink()

print('Final Supabase migration cleanup applied.')
