import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5180', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:5180/login.html')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.route('**/keyboard-harness', route => route.fulfill({ contentType: 'text/html', body: `<link rel="stylesheet" href="/style.css"><div id="modal-root"></div><div id="toasts"></div><script type="module">
  import {openTerminal,routeTerminalMessage} from '/ui/terminal.ts';import {store} from '/state.ts';import {openModal,h} from '/ui/dom.ts';
  store.floor='test';store.workers.set('worker1',{id:'worker1',kind:'shell',name:'Test terminal',color:'#abcdef',status:'idle',viewers:[],viewerIds:[],cols:80,rows:24});
  window.messages=[];const net={send:m=>window.messages.push(m)};
  window.open=()=>{openTerminal(net,'worker1');routeTerminalMessage({t:'term.snapshot',workerId:'worker1',data:'ready',cols:80,rows:24});};
  window.other=()=>openModal(h('div',{},'Other dialog'));window.open();
  </script>` }));
  await page.goto('http://127.0.0.1:5180/keyboard-harness');
  const terminal = page.getByRole('dialog', { name: 'Test terminal terminal' });
  await terminal.waitFor();
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.press('Escape');
  assert.equal(await terminal.count(), 1, 'Escape must keep the terminal open');
  await page.waitForFunction(() => window.messages.some(m => m.t === 'term.input' && m.data === '\x1b'));
  await page.keyboard.press('Control+]');
  assert.equal(await terminal.count(), 0, 'Ctrl+] closes the terminal');
  assert.equal(await page.evaluate(() => window.messages.some(m => m.t === 'term.input' && m.data === '\x1d')), false, 'close shortcut must not reach the agent');
  await page.evaluate(() => window.open());
  await page.getByRole('button', {name:'Close',exact:true}).click();
  assert.equal(await terminal.count(), 0);
  await page.evaluate(() => window.other());
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.backdrop').count(), 0, 'Escape still closes other dialogs');
  console.log('Terminal Escape passthrough, Ctrl+] close, close button, and ordinary modal checks passed');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
