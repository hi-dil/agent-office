// Run with node tests/machine-disk-browser.mjs; uses local Chrome and an isolated Vite port.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 5181;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60 && vite.exitCode === null; i++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/login.html`)).ok; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Fixture server did not start');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 980, height: 580 } });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let fail = false;
  await page.route('**/api/machine-disk', route => route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : { disk: { total: 1024 * 2 ** 30, used: 768 * 2 ** 30, available: 256 * 2 ** 30, percent: 75 } } }));
  await page.route('**/disk-harness', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/style.css"><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#dedcd6}canvas{border-radius:16px}</style><script type="module">
    import {MachineTexture} from '/features/boards/machine.ts';
    import {watchDisk} from '/features/boards/disk.ts';
    window.labels=[];
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.labels.push(text);return fillText.call(this,text,...args)};
    const board = new MachineTexture(); document.body.append(board.texture.image);
    const machine={cpu:38,cores:10,memUsed:18*2**30,memTotal:32*2**30,workers:14,history:Array.from({length:60},(_,i)=>[30+Math.sin(i/4)*12,54+Math.sin(i/8)*3])};
    board.render(machine);
    window.stopDisk=watchDisk(disk=>{window.disk=disk;board.render(machine,disk)});
  </script>` }));
  await page.goto(`http://127.0.0.1:${port}/disk-harness`);
  await page.waitForFunction(() => window.disk?.percent === 75);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/machine-disk-board.png' });
  fail = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => window.disk === null);
  await page.screenshot({ path: '/tmp/machine-disk-unavailable.png' });
  await page.evaluate(() => window.stopDisk());
  await page.reload();
  await page.waitForFunction(() => window.disk === null);
  assert.ok(await page.evaluate(() => window.labels.includes('Disk reading unavailable')), 'Initial failure replaces the loading label');
  await page.evaluate(() => window.stopDisk());
  assert.deepEqual(errors, []);
  console.log('Disk readings render; request failure clears stale data. Screenshots saved in /tmp.');
} finally { await browser?.close(); vite.kill(); }
