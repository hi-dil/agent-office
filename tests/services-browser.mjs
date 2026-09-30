import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5181', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:5181/login.html')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/services-harness', route => route.fulfill({ contentType: 'text/html', body: `<link rel="stylesheet" href="/style.css"><div id="modal-root"></div><div id="toasts"></div><script type="module">
  import {openServices} from '/ui/services.ts';import {store} from '/state.ts';
  store.services={port:4600,items:[{port:8180,pid:0,host:'100.71.28.27',source:'docker',floorId:'shrm',command:'Docker · nginx',directUrl:'http://shrm.100.71.28.27.sslip.io:8180',since:Date.now()},{port:5182,pid:123,host:'127.0.0.1',source:'project',floorId:'shrm',command:'vite',since:Date.now()}]};openServices();
  </script>` }));
  await page.goto('http://127.0.0.1:5181/services-harness');
  await page.getByRole('dialog',{name:'Services',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Open direct ↗',exact:true}).getAttribute('href'),'http://shrm.100.71.28.27.sslip.io:8180');
  assert.equal(await page.getByRole('link',{name:'Open ↗',exact:true}).getAttribute('href'),'http://localhost:5182');
  assert.equal(await page.locator('.svc-meta').filter({hasText:'Docker Compose'}).count(),1);
  assert.equal(await page.locator('.svc-meta').filter({hasText:'Shared project'}).count(),1);
  assert.deepEqual(errors,[]);
  console.log('Services board shows workerless Docker/host services and direct/tunnel links.');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
