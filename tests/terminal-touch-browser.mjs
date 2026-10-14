// Run with: node tests/terminal-touch-browser.mjs (CHROME_PATH overrides the browser).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5198';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5198', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${origin}/login.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(vite.exitCode, null, 'test Vite server must start');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const lite of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.route('**/touch-harness', route => route.fulfill({ contentType: 'text/html', body: `
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/${lite ? 'lite' : 'style'}.css">
      <body class="${lite ? 'lite' : ''}"><div id="modal-root"></div><div id="toasts"></div>
      <script type="module">
        import {openTerminal,routeTerminalMessage} from '/ui/terminal.ts';
        import {store} from '/state/index.ts';
        store.floor='test';
        store.workers.set('w',{id:'w',kind:'shell',name:'Mobile scroll',color:'#abcdef',status:'idle',viewers:[],viewerIds:[],cols:40,rows:24});
        window.messages=[];
        window.output=data=>routeTerminalMessage({t:'term.data',workerId:'w',data});
        window.openTerminal=()=>{
          openTerminal({send:m=>{window.messages.push(m);if(m.t==='term.resize')Object.assign(store.workers.get('w'),{cols:m.cols,rows:m.rows});}},'w',undefined,undefined,{keypad:${lite}});
          routeTerminalMessage({t:'term.snapshot',workerId:'w',data:Array.from({length:200},(_,i)=>'History line '+String(i+1).padStart(3,'0')).join('\\r\\n'),cols:40,rows:24});
        };
        window.openTerminal();
      </script>` }));
    await page.goto(`${origin}/touch-harness`);
    const rows = page.locator('.xterm-rows');
    await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('History line 200'));
    await page.waitForTimeout(300); // Let the opening animation and fit settle.
    if (!lite) await page.locator('.xterm-helper-textarea').blur();
    const firstLine = async () => (await rows.locator(':scope > :first-child').textContent()).trim();
    const before = await firstLine();
    const screen = await page.locator('.xterm-screen').boundingBox();
    const client = await page.context().newCDPSession(page);
    const x = screen.x + screen.width / 2;
    const startY = screen.y + screen.height * 0.3;
    const distance = Math.min(180, screen.height * 0.4);
    async function swipe(down) {
      const y = down ? startY : startY + distance;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 12; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (down ? 1 : -1) * distance * step / 12 }] });
        await page.waitForTimeout(20);
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(250);
    }
    await swipe(true);
    const older = await firstLine();
    assert.ok(older < before, `finger swipe must reveal earlier output (${lite ? 'lite' : '3D'}): ${before} -> ${older}`);
    assert.equal(await page.locator('.xterm-helper-textarea').evaluate(el => el === document.activeElement), false, 'scrolling must not summon the keyboard');
    assert.equal(await page.evaluate(() => window.scrollY), 0, 'the page must not scroll behind the terminal');
    assert.equal(await page.evaluate(() => window.messages.some(m => m.t === 'term.input')), false, 'scrollback must not type into the shell');
    await page.screenshot({ path: `/tmp/terminal-touch-${lite ? 'lite' : '3d'}.png` });
    await swipe(false);
    assert.ok(await firstLine() > older, 'reverse swipe must return toward recent output');
    // Desktop wheel handling still works through the same viewport.
    await page.mouse.move(x, startY);
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(250);
    assert.ok(await firstLine() < before, 'mouse wheel must still scroll');
    // Full-screen TUIs ask xterm for mouse wheel reports rather than browser scrollback.
    await page.evaluate(() => { window.messages=[]; window.output('\x1b[?1049h\x1b[?1000h\x1b[?1006hTUI ready'); });
    await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('TUI ready'));
    await swipe(true);
    assert.ok(await page.evaluate(() => window.messages.some(m => m.t === 'term.input' && /\x1b\[<64;/.test(m.data))), 'swiping must send wheel-up to a mouse-aware TUI');
    await page.getByRole('button', { name: 'Close', exact: true }).tap();
    await page.evaluate(() => window.openTerminal());
    await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('History line 200'));
    await page.waitForTimeout(300);
    const reopened = await firstLine();
    await swipe(true);
    assert.ok(await firstLine() < reopened, 'scrolling must work after reopening');
    await page.locator('.xterm-screen').tap({ position: { x: 30, y: 8 } });
    assert.equal(await page.locator('.xterm-helper-textarea').evaluate(el => el === document.activeElement), true, 'taps must still focus for typing');
    await page.close();
  }
  console.log('Mobile terminal swipes, reverse scrolling, TUI wheel reports, focus, reopen, and desktop wheel passed in lite and 3D.');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
