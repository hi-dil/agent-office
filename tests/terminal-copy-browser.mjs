import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5187';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5187', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${origin}/login.html`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const platform of ['MacIntel', 'Linux x86_64']) {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    await context.addInitScript(platform => Object.defineProperty(navigator, 'platform', { get: () => platform }), platform);
    const page = await context.newPage();
    await page.route('**/copy-harness', route => route.fulfill({ contentType: 'text/html', body: `<link rel="stylesheet" href="/style.css"><div id="modal-root"></div><div id="toasts"></div><script type="module">
      import {openTerminal,routeTerminalMessage} from '/ui/terminal.ts';import {store} from '/state/index.ts';
      store.floor='test';store.workers.set('worker1',{id:'worker1',kind:'shell',name:'Copy test',color:'#abcdef',status:'idle',viewers:[],viewerIds:[],cols:80,rows:24});
      window.messages=[];const net={send:m=>{window.messages.push(m);if(m.t==='term.resize')Object.assign(store.workers.get('worker1'),{cols:m.cols,rows:m.rows});}};
      window.output=data=>routeTerminalMessage({t:'term.data',workerId:'worker1',data});
      openTerminal(net,'worker1');routeTerminalMessage({t:'term.snapshot',workerId:'worker1',data:'COPY_THIS terminal output',cols:80,rows:24});
    </script>` }));
    await page.goto(`${origin}/copy-harness`);
    await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('COPY_THIS'));
    await page.waitForFunction(() => window.messages.some(m => m.t === 'term.resize'));
    await page.evaluate(() => Promise.all(document.querySelector('.modal').getAnimations().map(a => a.finished)));
    const select = async (modifier) => {
      const box = await page.locator('.xterm-screen').boundingBox();
      const cols = await page.evaluate(() => window.messages.filter(m => m.t === 'term.resize').at(-1).cols);
      const cell = box.width / cols;
      if (modifier) await page.keyboard.down(modifier);
      await page.mouse.move(box.x + cell * .1, box.y + 8);
      await page.mouse.down();
      await page.mouse.move(box.x + cell * 9.1, box.y + 8, { steps: 10 });
      await page.mouse.up();
      if (modifier) await page.keyboard.up(modifier);
    };
    const input = () => page.evaluate(() => window.messages.filter(m => m.t === 'term.input').map(m => m.data).join(''));
    const clearInput = () => page.evaluate(() => { window.messages.length = 0; });
    // A TUI's mouse mode must still allow local text selection with the platform override.
    await page.evaluate(() => window.output('\x1b[?1000h\x1b[?1006h'));
    await page.waitForFunction(() => document.querySelector('.xterm').classList.contains('enable-mouse-events'));
    await select(platform === 'MacIntel' ? 'Alt' : 'Shift');
    assert.equal(await page.locator('.xterm-selection div').count() > 0, true, `${platform}: selecting output must work in mouse-aware CLIs`);
    const copy = page.getByRole('button', { name: 'Copy selection', exact: true });
    assert.equal(await copy.isEnabled(), true);
    await clearInput();
    await page.keyboard.press('Control+Shift+C');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'COPY_THIS');
    assert.equal(await input(), '', 'copy shortcut must not reach the CLI');
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
    await copy.click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'COPY_THIS');
    assert.equal(await input(), '', 'copy button must not send input');
    await page.keyboard.press('Control+c');
    assert.equal(await input(), '', 'Ctrl+C copies a selection without interrupting');
    if (platform === 'MacIntel') {
      await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
      await page.keyboard.press('Meta+c');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'COPY_THIS');
      assert.equal(await input(), '', 'Cmd+C must not reach the CLI');
    }
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
    // A denied Clipboard API falls back to native browser copy, keeping terminal focus.
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('Denied'); };
    });
    await copy.click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'COPY_THIS');
    assert.equal(await page.locator('.xterm-helper-textarea').evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => {
      window.nativeCopy = document.execCommand;
      document.execCommand = () => false;
    });
    await copy.click();
    await page.getByText('Could not copy. Try the browser’s Copy action.', { exact: true }).waitFor();
    assert.equal(await page.locator('.xterm-helper-textarea').evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => { document.execCommand = window.nativeCopy; delete navigator.clipboard.writeText; });
    await page.screenshot({ path: `/tmp/agent-office-terminal-copy-${platform.split(' ')[0]}.png` });
    // Typing clears selection, so Ctrl+C must still interrupt once no selection remains.
    await page.keyboard.type('x');
    await clearInput();
    await page.keyboard.press('Control+c');
    assert.equal(await input(), '\x03', 'Ctrl+C without selection interrupts');
    assert.equal(await copy.isDisabled(), true);
    if (platform === 'MacIntel') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: '/tmp/agent-office-terminal-copy-mobile.png' });
      const close = await page.getByRole('button', { name: 'Close', exact: true }).boundingBox();
      assert.ok(close.x >= 0 && close.x + close.width <= 390, 'Close stays visible on narrow screens');
    }
    await context.close();
  }
  console.log('Terminal selection, copying, and interrupt checks passed on Mac and Linux');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
