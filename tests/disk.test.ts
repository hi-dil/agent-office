import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { DiskSampler, diskFromStats } from '../src/server/disk.js';

test('disk usage distinguishes occupied blocks from space available to this user', () => {
  assert.deepEqual(diskFromStats({ bsize: 4096, blocks: 1000, bfree: 400, bavail: 350 }), {
    total: 4096000, used: 2457600, available: 1433600, percent: 60,
  });
  assert.equal(diskFromStats({ bsize: 4096, blocks: 0, bfree: 0, bavail: 0 }), null);
  assert.equal(diskFromStats({ bsize: 4096, blocks: 100, bfree: 101, bavail: 0 }), null);
});

test('disk sampler reads the office filesystem and handles unavailable paths', async () => {
  const disk = new DiskSampler();
  const reading = await disk.read(tmpdir());
  assert.ok(reading && reading.total > 0);
  assert.ok(reading.used >= 0 && reading.available >= 0 && reading.percent <= 100);
  assert.equal(await disk.read('/nonexistent-agent-office-test-volume/no-such-path'), null);
});

test('simultaneous viewers share a filesystem sample without mixing volumes', async () => {
  const sampler = new DiskSampler();
  const first = sampler.read(tmpdir());
  assert.equal(sampler.read(tmpdir()), first);
  assert.notEqual(sampler.read('/nonexistent-agent-office-test-volume'), first);
  assert.ok(await first);
});
