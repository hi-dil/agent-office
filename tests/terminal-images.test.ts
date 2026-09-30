import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveTerminalImage } from '../src/server/terminal-images.js';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('clipboard images persist privately with generated paths, ignoring supplied filenames', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'terminal-images-'));
  try {
    const file = await saveTerminalImage(dir, { type: 'image/png', data: png, name: '../../escape.png' });
    assert.equal(path.dirname(file), path.join(dir, '.agent-office', 'attachments'));
    assert.deepEqual(await readFile(file), Buffer.from(png, 'base64'));
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('rejects active content, bad encodings, mismatched image types and oversized images', async () => {
  for (const body of [null, { type: 'image/svg+xml', data: png }, { type: 'image/png', data: 'bad!' }, { type: 'image/jpeg', data: png }, { type: 'image/png', data: 'A'.repeat(14 * 1024 * 1024) }]) {
    await assert.rejects(saveTerminalImage('/unused', body));
  }
});
