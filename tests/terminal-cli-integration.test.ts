import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as pty from '@lydell/node-pty';
import { WebSocketServer } from 'ws';
import { COOKIE_NAME } from '../src/server/auth.js';

async function fixture(t: any) {
  const requests: string[] = [], messages: any[] = [];
  const dir = mkdtempSync(path.join(os.tmpdir(),'office-terminal-cli-'));
  const server = http.createServer((req,res) => {
    requests.push(req.url!);
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/login' && req.method==='GET') {res.end('{"accounts":false,"shared":true}');return;}
    if(req.url==='/api/login') {
      let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
        if(JSON.parse(body).password!=='test-password') {res.writeHead(401).end('{"error":"Wrong password"}');return;}
        res.setHeader('Set-Cookie',`${COOKIE_NAME}=session; HttpOnly`);res.end('{"ok":true}');
      }); return;
    }
    if(!req.headers.cookie?.includes(`${COOKIE_NAME}=session`)) {res.writeHead(401).end('{}');return;}
    if(req.url==='/api/services') {res.end('{"items":[],"port":4600}');return;}
    res.end(JSON.stringify({terminals:[{id:'worker1',name:'Agent',floor:'Project',floorId:'project',kind:'agent',status:'idle'}]}));
  });
  const wss = new WebSocketServer({server});
  wss.on('connection',(ws,req)=>{
    assert.equal(new URL(req.url!,'http://test').searchParams.get('floor'),'@roof');
    assert.match(req.headers.cookie!,/session/);
    ws.send(JSON.stringify({t:'welcome'}));
    ws.on('message',raw=>{
      const m=JSON.parse(raw.toString());messages.push(m);
      if(m.t==='worker.attach') ws.send(JSON.stringify({t:'term.snapshot',workerId:m.workerId,data:'CLI_READY',cols:80,rows:24}));
      if(m.t==='term.input') ws.send(JSON.stringify({t:'term.data',workerId:m.workerId,data:'ECHO:'+m.data}));
    });
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${(server.address() as any).port}`;
  const env={...process.env,AGENT_OFFICE_PASSWORD:'test-password',AGENT_OFFICE_URL:url,XDG_CONFIG_HOME:dir};
  t.after(()=>{for(const ws of wss.clients)ws.terminate();wss.close();server.close();rmSync(dir,{recursive:true,force:true});});
  return {env,requests,messages,wss};
}
const delay = (ms: number)=>new Promise(r=>setTimeout(r,ms));
async function until(check:()=>boolean) {
  for(let i=0;i<150;i++){if(check())return;await delay(50);}
  assert.fail('Timed out waiting for terminal output');
}

test('CLI lists authenticated metadata without connecting to any worker',async t=>{
  const f=await fixture(t);
  const child=spawn(process.execPath,['--import','tsx','src/server/cli.ts','terminals','--json'],{env:f.env});
  let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);
  const [code]=await once(child,'exit');assert.equal(code,0,err);
  assert.equal(JSON.parse(out)[0].id,'worker1');
  assert.equal(f.messages.length,0);assert.ok(f.requests.includes('/api/terminals'));
});

test('real terminal attaches, forwards control keys, resizes and detaches without killing worker',async t=>{
  const f=await fixture(t);
  const child=pty.spawn(process.execPath,['--import','tsx','src/server/cli.ts','attach','worker1'],{env:f.env as Record<string,string>,cols:90,rows:30,cwd:process.cwd(),name:'xterm-256color'});
  t.after(()=>{try{child.kill();}catch{}});
  let out='';child.onData(d=>out+=d);
  const exit=new Promise<number>(resolve=>child.onExit(e=>resolve(e.exitCode)));
  await until(()=>out.includes('CLI_READY'));
  child.write('hello\x03');
  await until(()=>f.messages.some(m=>m.t==='term.input'&&m.data.includes('hello\x03')));
  child.resize(100,40);
  await until(()=>f.messages.some(m=>m.t==='term.resize'&&m.cols===100&&m.rows===40));
  child.write('\x1d');
  assert.equal(await exit,0);
  assert.ok(f.messages.some(m=>m.t==='worker.detach'));
  assert.ok(!f.messages.some(m=>m.t==='worker.kill'||m.t==='worker.stop'||m.data?.includes('\x1d')));
  assert.match(out,/Detached/);
  assert.ok(out.includes('\x1b[?1049l'),'restores the outer screen');
});

test('connection loss exits cleanly without stopping the worker',async t=>{
  const f=await fixture(t);
  const child=pty.spawn(process.execPath,['--import','tsx','src/server/cli.ts','attach','worker1'],{env:f.env as Record<string,string>,cols:80,rows:24,cwd:process.cwd(),name:'xterm-256color'});
  t.after(()=>{try{child.kill();}catch{}});
  let out='';child.onData(d=>out+=d);
  const exit=new Promise<number>(resolve=>child.onExit(e=>resolve(e.exitCode)));
  await until(()=>out.includes('CLI_READY'));
  for(const ws of f.wss.clients)ws.close();
  assert.equal(await exit,1);
  assert.match(out,/connection closed/);
  assert.ok(out.includes('\x1b[?1049l'));
  assert.ok(!f.messages.some(m=>m.t==='worker.kill'));
});


test('password prompt hides credentials and Ctrl+C cancels before login',async t=>{
  const f=await fixture(t);
  const env: Record<string,string|undefined>={...f.env};delete env.AGENT_OFFICE_PASSWORD;
  const child=pty.spawn(process.execPath,['--import','tsx','src/server/cli.ts','terminals'],{env:env as Record<string,string>,cols:80,rows:24,cwd:process.cwd()});
  t.after(()=>{try{child.kill();}catch{}});
  let out='';child.onData(d=>out+=d);
  const exit=new Promise<number>(resolve=>child.onExit(e=>resolve(e.exitCode)));
  await until(()=>out.includes('Office password:'));
  child.write('do-not-echo');child.write('\x03');
  assert.equal(await exit,1);
  assert.ok(!out.includes('do-not-echo'));assert.match(out,/cancelled/);
  assert.equal(f.requests.filter(p=>p==='/api/login').length,1);
});
