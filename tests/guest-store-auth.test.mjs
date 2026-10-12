import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { guestStoreHeaders } from '../src/server/guestStoreAuth.ts';

test('guest edge relay secret is never included without server configuration', () => {
  const original = process.env.INSTAGRAM_APP_SECRET;
  try {
    delete process.env.INSTAGRAM_APP_SECRET;
    assert.deepEqual(guestStoreHeaders(), {});
    process.env.INSTAGRAM_APP_SECRET = 'unit-test-private-only';
    assert.deepEqual(guestStoreHeaders(), { 'X-Autoreply-Guest-Secret': 'unit-test-private-only' });
  } finally {
    if (original === undefined) delete process.env.INSTAGRAM_APP_SECRET;
    else process.env.INSTAGRAM_APP_SECRET = original;
  }
});

test('all guest-facing Vercel routes authenticate to the Edge account store', () => {
  for (const path of [
    'api/_auth.ts',
    'api/automations.ts',
    'api/workspace-data.ts',
    'api/instagram/account.ts',
    'api/instagram/media.ts',
    'api/instagram/refresh-contacts.ts',
  ]) {
    const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
    assert.match(source, /guestStoreHeaders\(\)/, path);
  }
  const edge = readFileSync(new URL('../supabase/functions/instagram-account-store/index.ts', import.meta.url), 'utf8');
  assert.match(edge, /x-autoreply-guest-secret/);
  assert.match(edge, /Guest workspace server authorization required/);
});
