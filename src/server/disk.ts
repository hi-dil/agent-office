import { statfs } from 'node:fs/promises';
import type { DiskUsage } from '../shared/disk.js';

type Space = { bsize: number; blocks: number; bfree: number; bavail: number };

export function diskFromStats(s: Space): DiskUsage | null {
  if (![s.bsize, s.blocks, s.bfree, s.bavail].every(Number.isFinite)
    || s.bsize <= 0 || s.blocks <= 0 || s.bfree < 0 || s.bfree > s.blocks || s.bavail < 0 || s.bavail > s.bfree) return null;
  const total = s.bsize * s.blocks;
  const used = s.bsize * (s.blocks - s.bfree);
  const available = s.bsize * s.bavail;
  return [total, used, available].every(Number.isSafeInteger)
    ? { total, used, available, percent: Math.round(100 * used / total) } : null;
}

/** Coalesce viewers' reads and cache them for ten seconds, including failures. */
export class DiskSampler {
  private cached?: { path: string; at: number; value: Promise<DiskUsage | null> };
  read(path: string): Promise<DiskUsage | null> {
    const now = Date.now();
    if (this.cached?.path === path && now - this.cached.at < 10_000) return this.cached.value;
    const value = statfs(path).then(diskFromStats, () => null);
    this.cached = { path, at: now, value };
    return value;
  }
}
