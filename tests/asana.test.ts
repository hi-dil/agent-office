import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { AsanaBoard } from '../src/server/asana.js';
import { parseAsanaProject, asanaTaskPrompt } from '../src/shared/asana.js';

const project = '1217014847874353';
const json = (data: unknown, next_page: unknown = null) => new Response(JSON.stringify({ data, next_page }), { status: 200 });
const task = (gid = '9001') => ({ gid, name: 'Fix payroll', notes: '<script>task text</script>', completed: false, due_on: '2026-10-01', assignee: { name: 'Aida' }, memberships: [{ project: { gid: 'other' }, section: { name: 'Wrong' } }, { project: { gid: project }, section: { name: 'Ready' } }] });
function setup(t: any, fetcher: typeof fetch) {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-asana-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, board: new AsanaBoard(dir, fetcher) };
}

test('project URLs select the project, not workspace or board, and preserve large IDs', () => {
  assert.equal(parseAsanaProject(`https://app.asana.com/1/1199167967865157/project/${project}/board/1217015368847447`), project);
  assert.equal(parseAsanaProject(`https://app.asana.com/0/${project}/list`), project);
  assert.equal(parseAsanaProject('99999999999999999999'), '99999999999999999999');
  for (const value of ['https://evil.test/0/123/list', 'https://app.asana.com/1/123/task/456', 'file:///123', '0', 'abc', 'https://app.asana.com@evil.test/0/123']) assert.equal(parseAsanaProject(value), undefined);
});

test('a project can be saved before connecting; token is private, persisted, and isolated per floor', async t => {
  const { dir, board } = setup(t, async () => json({ gid: project, name: 'SHRM' }));
  await board.configure(project, '');
  assert.equal(board.state().project?.gid, project);
  assert.equal(board.state().hasToken, false);
  assert.deepEqual(board.state().items, []);
  assert.equal(new AsanaBoard(dir).state().project?.gid, project);
  const other = setup(t, fetch).board;
  assert.equal(other.state().project, undefined);
});

test('pagination uses the trusted origin, chooses this project section and never exposes credentials', async t => {
  const calls: URL[] = [];
  const { dir, board } = setup(t, async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.equal(url.origin, 'https://app.asana.com');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
    assert.equal(init?.redirect, 'error');
    if (!url.pathname.endsWith('/tasks')) return json({ gid: project, name: 'SHRM' });
    if (!url.searchParams.has('offset')) return json([task()], { offset: 'next page', uri: 'https://evil.test/steal' });
    assert.equal(url.searchParams.get('offset'), 'next page');
    return json([task('9002')]);
  });
  await board.configure(project, 'test-token');
  const state = board.state();
  assert.deepEqual(state.items.map(t => t.gid), ['9001', '9002']);
  assert.equal(state.items[0].section, 'Ready');
  assert.equal(state.items[0].assignee, 'Aida');
  assert.equal(state.items[0].url, `https://app.asana.com/0/${project}/9001`);
  assert.ok(!JSON.stringify(state).includes('test-token'));
  assert.equal(statSync(path.join(dir, 'asana.json')).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'asana.json'), 'utf8')).token, 'test-token');
  await board.refresh();
  assert.equal(calls.length, 3, 'fresh state is cached');
  assert.equal(new AsanaBoard(dir).state().hasToken, true);
  assert.match(asanaTaskPrompt(state.items[0]), /Fix payroll/);
  assert.match(asanaTaskPrompt(state.items[0]), /<script>task text<\/script>/);
  assert.match(asanaTaskPrompt(state.items[0]), /https:\/\/app.asana.com/);
  assert.ok(!asanaTaskPrompt(state.items[0]).includes('test-token'));
});

test('bad replacement credentials preserve connection and errors cannot leak provider text', async t => {
  let rejected = false;
  const { dir, board } = setup(t, async input => {
    if (rejected) return new Response('secret-token echoed upstream', { status: 401 });
    return String(input).includes('/tasks?') ? json([task()]) : json({ gid: project, name: 'SHRM' });
  });
  await board.configure(project, 'good-token');
  rejected = true;
  await assert.rejects(board.configure('777', 'bad-token'), /token/i);
  assert.equal(board.state().project?.gid, project);
  assert.equal(board.state().items.length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(dir, 'asana.json'), 'utf8')).token, 'good-token');
  await board.refresh(true);
  assert.match(board.state().error!, /token/i);
  assert.ok(!board.state().error?.includes('secret-token'));
});

test('disconnect wins over a pending refresh and deletes credentials', async t => {
  let resolve!: (response: Response) => void;
  let pending = false;
  const { board, dir } = setup(t, async input => {
    if (pending) return await new Promise<Response>(r => { resolve = r; });
    return String(input).includes('/tasks?') ? json([task()]) : json({ gid: project, name: 'SHRM' });
  });
  await board.configure(project, 'token');
  pending = true;
  const refresh = board.refresh(true);
  board.disconnect();
  pending = false;
  resolve(json({ gid: project, name: 'SHRM' }));
  await refresh;
  assert.equal(board.state().project, undefined);
  assert.deepEqual(board.state().items, []);
  assert.equal(existsSync(path.join(dir, 'asana.json')), false);
});

test('rate limiting retains cached tasks and exposes a useful error', async t => {
  let rateLimited = false;
  const { board } = setup(t, async input => rateLimited ? new Response('', { status: 429, headers: { 'retry-after': '60' } }) : String(input).includes('/tasks?') ? json([task()]) : json({ gid: project, name: 'SHRM' }));
  await board.configure(project, 'token');
  rateLimited = true;
  await board.refresh(true);
  assert.equal(board.state().items.length, 1);
  assert.match(board.state().error!, /rate limit/i);
});

test('pagination is bounded and partial results are labelled', async t => {
  let pages = 0;
  const { board } = setup(t, async input => {
    if (!String(input).includes('/tasks?')) return json({ gid: project, name: 'SHRM' });
    pages++;
    return json(Array.from({ length: 100 }, (_, i) => task(String(pages * 100 + i))), { offset: String(pages) });
  });
  await board.configure(project, 'token');
  assert.equal(pages, 10);
  assert.equal(board.state().items.length, 1000);
  assert.equal(board.state().truncated, true);
});

test('a completed replacement connection wins over an older in-flight refresh', async t => {
  let resolve!: (response: Response) => void;
  let hold = false;
  const { board } = setup(t, async input => {
    const url = String(input);
    if (hold && url.includes(`projects/${project}?`)) { hold = false; return await new Promise<Response>(r => { resolve = r; }); }
    if (url.includes('/tasks?')) return json([]);
    const gid = /projects\/(\d+)/.exec(url)![1];
    return json({ gid, name: gid === project ? 'Old project' : 'New project' });
  });
  await board.configure(project, 'token');
  hold = true;
  const old = board.refresh(true);
  await board.configure('777', '');
  resolve(json({ gid: project, name: 'Old project' }));
  await old;
  assert.equal(board.state().project?.gid, '777');
  assert.equal(board.state().project?.name, 'New project');
});

test('empty projects succeed and malformed task lists report an error without discarding cache', async t => {
  let malformed = false;
  const { board } = setup(t, async input => String(input).includes('/tasks?') ? json(malformed ? { bad: true } : []) : json({ gid: project, name: 'SHRM' }));
  await board.configure(project, 'token');
  assert.equal(board.state().error, undefined);
  assert.equal(board.state().items.length, 0);
  malformed = true;
  await board.refresh(true);
  assert.match(board.state().error!, /invalid task list/);
  assert.equal(board.state().loading, false);
});
