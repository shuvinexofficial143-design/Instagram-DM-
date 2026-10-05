import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { transform } from 'esbuild';

test('compiled API functions load in native Node ESM without a TS resolver', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'autoreply-api-'));
  try {
    await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    const files = ['src/server/supabaseConfig.ts', 'api/webhook.ts', 'api/google-sheets.ts', 'api/auth/instagram.ts', 'api/_auth.ts', 'api/usage.ts', 'api/openai/chat.ts', 'api/openai/analyze-prompt.ts'];
    for (const file of files) {
      const output = path.join(root, file.replace(/\.ts$/, '.js'));
      await fs.mkdir(path.dirname(output), { recursive: true });
      const result = await transform(await fs.readFile(file, 'utf8'), { loader: 'ts', format: 'esm' });
      await fs.writeFile(output, result.code);
    }
    for (const file of files.filter(f => f.startsWith('api/'))) {
      const url = pathToFileURL(path.join(root, file.replace(/\.ts$/, '.js'))).href;
      assert.doesNotThrow(() => execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`], { stdio: 'pipe' }));
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
