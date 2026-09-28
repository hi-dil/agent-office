import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AsanaBoard } from '../src/server/asana.js';
import { asanaRequest } from '../src/server/asana-http.js';

function setup(t: any) {
  const dir = mkdtempSync(path.join(tmpdir(), 'asana-http-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new AsanaBoard(dir);
}
const admin = { method: 'POST', admin: true, sameOrigin: true, body: { project: '1217014847874353', token: '' } };

test('only an admin can change a floor connection; all writes require same origin', async t => {
  const board = setup(t);
  assert.equal((await asanaRequest(board, { ...admin, admin: false })).status, 403);
  assert.equal((await asanaRequest(board, { ...admin, sameOrigin: false })).status, 403);
  assert.equal(board.state().project, undefined);
  assert.equal((await asanaRequest(board, admin)).status, 200);
  assert.equal(board.state().project?.gid, '1217014847874353');
  assert.equal((await asanaRequest(board, { ...admin, method: 'DELETE', admin: false })).status, 403);
  assert.ok(board.state().project);
  assert.equal((await asanaRequest(board, { ...admin, method: 'DELETE' })).status, 200);
  assert.equal(board.state().project, undefined);
});

test('members can read and refresh, but missing floors and invalid methods are rejected', async t => {
  const board = setup(t);
  await asanaRequest(board, admin);
  const member = { method: 'GET', admin: false, sameOrigin: true };
  const result = await asanaRequest(board, member);
  assert.equal(result.status, 200);
  assert.equal((result.body as any).project.gid, '1217014847874353');
  assert.equal((await asanaRequest(board, { ...member, method: 'POST', refresh: true })).status, 200);
  assert.equal((await asanaRequest(board, { ...member, method: 'POST', refresh: true, sameOrigin: false })).status, 403);
  assert.equal((await asanaRequest(undefined, member)).status, 404);
  assert.equal((await asanaRequest(board, { ...member, method: 'PATCH' })).status, 405);
});

test('malformed settings do not overwrite the saved project', async t => {
  const board = setup(t);
  await asanaRequest(board, admin);
  for (const body of [null, [], {}, { project: 123, token: '' }, { project: '123', token: 123 }, { project: 'https://evil.test/123', token: 'secret' }, { project: '123', token: 'x'.repeat(4097) }]) {
    assert.equal((await asanaRequest(board, { ...admin, body })).status, 400);
    assert.equal(board.state().project?.gid, '1217014847874353');
  }
});
