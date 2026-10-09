import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5197', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:5197/login.html')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(vite.exitCode, null, 'test Vite server must start successfully');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.route('**/link-harness', route => route.fulfill({ contentType: 'text/html', body: `<link rel="stylesheet" href="/style.css"><div id="modal-root"></div><div id="toasts"></div><script type="module">
    import {openTerminal,routeTerminalMessage} from '/ui/terminal.ts';
    import {store} from '/state/index.ts';
    store.floor='test';store.workers.set('w',{id:'w',kind:'shell',name:'Links',color:'#abcdef',status:'idle',viewers:[],viewerIds:[],cols:80,rows:24});
    window.captureLinks=true;window.links=[];window.opens=0;window.open=()=>{window.opens++;return null;};
    document.addEventListener('click',e=>{const a=e.target.closest('a');if(a){if(window.captureLinks)e.preventDefault();window.links.push({href:a.href,target:a.target,rel:a.rel,ctrl:e.ctrlKey,meta:e.metaKey,shift:e.shiftKey});}});
    openTerminal({send(){}},'w');routeTerminalMessage({t:'term.snapshot',workerId:'w',data:'https://example.com/terminal-link',cols:80,rows:24});
  </script>` }));
  await page.goto('http://127.0.0.1:5197/link-harness');
  await page.locator('.xterm-screen').waitFor();
  await page.waitForTimeout(500);
  const box = await page.locator('.xterm-screen').boundingBox();
  for (const modifiers of [[], ['Control'], ['Meta'], ['Shift']]) {
    await page.mouse.move(box.x+30,box.y+8);
    await page.waitForTimeout(150);
    await page.locator('.xterm-screen').click({position:{x:30,y:8},modifiers});
  }
  const result = await page.evaluate(()=>({links:window.links,opens:window.opens}));
  assert.equal(result.links.length,4,'terminal links must activate browser anchors');
  assert.equal(result.opens,0,'terminal must not call window.open');
  for (const a of result.links) {assert.equal(a.href,'https://example.com/terminal-link');assert.equal(a.target,'_blank');assert.match(a.rel,/noopener/);assert.match(a.rel,/noreferrer/);}
  assert.deepEqual(result.links.map(a=>[a.ctrl,a.meta,a.shift]),[[false,false,false],[true,false,false],[false,true,false],[false,false,true]]);
  await page.context().route('https://example.com/terminal-link', route => route.fulfill({contentType:'text/html',body:'Terminal link destination'}));
  await page.evaluate(()=>{window.captureLinks=false;});
  const opened = page.context().waitForEvent('page');
  await page.locator('.xterm-screen').click({position:{x:30,y:8}});
  const destination = await opened;
  await destination.waitForLoadState();
  assert.equal(destination.url(),'https://example.com/terminal-link');
  assert.equal(await destination.evaluate(()=>window.opener),null,'destination must have no opener');
  await destination.close();
  await page.screenshot({path:'/tmp/terminal-links.png'});
  console.log('Terminal links use anchors and preserve Ctrl, Cmd and Shift modifiers.');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
