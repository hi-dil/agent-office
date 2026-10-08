import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AsanaWallState, asanaBoardMode } from '../src/client/features/project-tools/asana-state.js';
import type { AsanaState } from '../src/shared/asana.js';
const state = (id: string): AsanaState => ({ project: { gid: id, name: id, url: `https://app.asana.com/0/${id}/list` }, hasToken: true, items: [], fetchedAt: 1, loading: false, truncated: false });
test('old floor responses cannot replace the current Asana board', async () => {
  const pending = new Map<string, (s: AsanaState) => void>();
  const wall = new AsanaWallState((floor) => new Promise(resolve => pending.set(floor, resolve)), () => {});
  const a = wall.load('a');
  const b = wall.load('b');
  pending.get('b')!(state('2')); await b;
  pending.get('a')!(state('1')); await a;
  assert.equal(wall.state?.project?.gid, '2');
  assert.equal(wall.floor, 'b');
});
test('refresh failure keeps configured Asana visible, disconnect returns to GitHub', async () => {
  let next: AsanaState | Error = state('1');
  const wall = new AsanaWallState(async () => { if (next instanceof Error) throw next; return next; }, () => {});
  await wall.load('a');
  next = Error('offline'); await wall.load('a');
  assert.equal(wall.state?.project?.gid, '1');
  assert.match(wall.state?.error ?? '', /offline/);
  next = { hasToken: false, items: [], fetchedAt: 0, loading: false, truncated: false };
  await wall.load('a');
  assert.equal(wall.state?.project, undefined);
});
test('a connection change supersedes an in-flight read on the same floor', async () => {
  const pending: ((s: AsanaState) => void)[] = [];
  const wall = new AsanaWallState(() => new Promise(resolve => pending.push(resolve)), () => {});
  const old = wall.load('a');
  const fresh = wall.load('a', true);
  pending[1](state('2')); await fresh;
  pending[0](state('1')); await old;
  assert.equal(wall.state?.project?.gid, '2');
  await wall.load(null);
  assert.equal(wall.state, undefined);
});

test('only confirmed unlinked metadata permits GitHub fallback', () => {
  assert.equal(asanaBoardMode(), 'pending');
  assert.equal(asanaBoardMode({ hasToken: false, items: [], loading: false, truncated: false, fetchedAt: 0, error: 'offline' }), 'pending');
  assert.equal(asanaBoardMode(state('1')), 'asana');
  assert.equal(asanaBoardMode({ hasToken: false, items: [], loading: false, truncated: false, fetchedAt: 0 }), 'github');
});
