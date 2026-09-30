import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const IMAGE_BODY_LIMIT = 14 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Clipboard data stays on the worker's machine; clients cannot choose a destination filename. */
export async function saveTerminalImage(projectDir: string, body: unknown): Promise<string> {
  const b = body as { type?: unknown; data?: unknown } | null;
  if (!b || typeof b.type !== 'string' || typeof b.data !== 'string') throw new Error('Invalid image upload');
  const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
  const ext = extensions[b.type];
  if (!ext) throw new Error('Use a PNG, JPEG, GIF, or WebP image');
  if (!b.data.length || b.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new Error('Images must be under 10 MB');
  if (/[^A-Za-z0-9+/=]/.test(b.data)) throw new Error('Invalid image encoding');
  const bytes = Buffer.from(b.data, 'base64');
  if (bytes.toString('base64') !== b.data) throw new Error('Invalid image encoding');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Images must be under 10 MB');
  const valid = ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : ext === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : ext === 'gif' ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('ascii'))
    : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!valid) throw new Error('The uploaded data is not the selected image type');
  const dir = path.join(projectDir, '.agent-office', 'attachments');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${randomUUID()}.${ext}`);
  await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  return file;
}
