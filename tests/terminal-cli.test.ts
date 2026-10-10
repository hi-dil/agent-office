import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, selectTerminal } from '../src/server/terminal-cli/options.js';
import { terminalList } from '../src/server/http/routes/terminals.js';

test('terminal CLI validates commands and URL before asking for credentials', () => {
  assert.equal(parseArgs(['terminals']).url, 'http://127.0.0.1:4600');
  assert.equal(parseArgs(['attach', 'abc', '--url', 'https://office.example', '--name', 'Sam']).worker, 'abc');
  assert.throws(() => parseArgs(['attach']), /worker/);
  assert.throws(() => parseArgs(['terminals', '--password', 'secret']), /Unknown option/);
  assert.throws(() => parseArgs(['terminals', '--url', 'https://user:secret@example.com']), /credentials/);
  assert.throws(() => parseArgs(['terminals', '--url', 'file:///tmp/foo']), /HTTP/);
});

test('selection prefers exact IDs and refuses ambiguous names', () => {
  const rows = [{id:'a',name:'Sam',floor:'one',floorId:'f1'}, {id:'b',name:'Sam',floor:'two',floorId:'f2'}];
  assert.equal(selectTerminal(rows,'a').id,'a');
  assert.throws(() => selectTerminal(rows,'Sam'), /ambiguous/i);
  assert.throws(() => selectTerminal(rows,'gone'), /No terminal/);
});

test('list endpoint exposes terminal metadata without secrets or worker mutations', () => {
  const ctx = {floors:new Map([['f1',{id:'f1',def:{name:'Project'},workers:{list:()=>[{id:'w1',name:'Sam',kind:'agent',provider:'codex',status:'idle',hookToken:'secret',sessionId:'private',cols:80,rows:24}]}}]])};
  const rows=terminalList(ctx as any);
  assert.deepEqual(rows,[{id:'w1',name:'Sam',kind:'agent',provider:'codex',status:'idle',floor:'Project',floorId:'f1'}]);
});

test('terminal listing route requires a session before exposing project or worker names', async t => {
  const { requestHandler } = await import('../src/server/http/router.js');
  const { terminalsRoute } = await import('../src/server/http/routes/terminals.js');
  const http = await import('node:http');
  const { once } = await import('node:events');
  const ctx = { cfg:{port:4600}, services:{lookup:()=>undefined}, auth:{fromRequest:(req:any)=>req.headers.cookie==='session=yes'?{}:undefined}, floors:new Map() };
  const server=http.createServer(requestHandler(ctx as any,[terminalsRoute]));
  t.after(()=>server.close());
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as any).port}/api/terminals`;
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{headers:{cookie:'session=yes'}});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{terminals:[]});
});


test('large Unicode pastes survive separate UTF-8 PTY writes', async () => {
  const { inputChunks } = await import('../src/server/terminal-cli/attach.js');
  const original = 'a'.repeat(15999) + '😀' + '文'.repeat(50000);
  const chunks = [...inputChunks(original)];
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => Buffer.byteLength(c) < 65536));
  assert.equal(Buffer.concat(chunks.map(c => Buffer.from(c))).toString(), original);
});
