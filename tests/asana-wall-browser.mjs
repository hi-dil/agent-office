// Fixture-only check: node tests/asana-wall-browser.mjs (requires local Chrome and listening sockets).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 5179;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (vite.exitCode !== null) break;
    try { ready = (await fetch(`http://127.0.0.1:${port}/login.html`)).ok; } catch {}
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Vite could not listen on the fixture port');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(12_000);
  page.on('console', m => { if (m.type() === 'error') console.error('Console:', m.text()); });
  page.on('requestfailed', r => console.error('Request failed:', r.url(), r.failure()?.errorText));
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('Browser error:', e.message); });
  const task = { gid: '9001', name: 'Fix payroll', notes: 'Keep approval checks.', url: 'https://app.asana.com/0/123/9001', section: 'Ready', assignee: 'Aida' };
  await page.route('**/api/asana**', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('floor') === 'shrm'
    ? { project: { gid: '123', name: 'SHRM', url: 'https://app.asana.com/0/123/list' }, hasToken: true, items: [task], fetchedAt: Date.now(), loading: false, truncated: false }
    : { hasToken: false, items: [], fetchedAt: 0, loading: false, truncated: false } }));
  await page.route('**/asana-wall-harness', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><link rel="stylesheet" href="/style.css"><div id="wall"></div><button id="issues">Issues</button><div id="modal-root"></div><div id="toasts"></div><script type="module">
    import {watchAsanaWall} from '/features/project-tools/asana-wall.ts';
    import {issueBoardSource,onIssueBoardSource} from '/shared/issue-board.ts';
    import {openBoard} from '/ui/boards.ts'; import {openAsanaBoard} from '/ui/asana.ts'; import {store} from '/state/index.ts';
    window.store=store;window.source=issueBoardSource;window.sent=[];
    store.floor='shrm';store.me={admin:true};store.project={name:'SHRM',dir:'/fixture',branch:'main',defaultProvider:'codex',agentProviders:['codex'],agentCmd:'codex'};
    onIssueBoardSource(()=>document.getElementById('wall').replaceChildren(...(issueBoardSource()?[issueBoardSource().canvas]:[])));
    watchAsanaWall(()=>openAsanaBoard({assign:(prompt)=>window.handoff=prompt,queue:(prompt)=>window.queued=prompt}));
    document.getElementById('issues').onclick=()=>openBoard('issues',{send:msg=>window.sent.push(msg)},{});
  </script>` }));
  await page.goto(`http://127.0.0.1:${port}/asana-wall-harness`);
  await page.waitForFunction(() => typeof window.source === 'function' && window.source()?.title === 'Asana · SHRM');
  assert.equal(await page.locator('#wall canvas').count(), 1);
  await page.screenshot({ path: '/tmp/asana-issues-wall.png' });
  await page.locator('#issues').click();
  await page.getByRole('dialog', { name: 'Asana tasks', exact: true }).waitFor();
  await page.getByRole('button', { name: /Fix payroll/ }).click();
  await page.getByRole('button', { name: 'Hand to worker', exact: true }).click();
  await page.waitForFunction(() => window.handoff?.includes('9001'));
  assert.deepEqual(await page.evaluate(() => window.sent), []);
  await page.evaluate(() => { store.floor='plain';store.emit('floor'); });
  await page.waitForFunction(() => !window.source());
  await page.locator('#issues').click();
  await page.getByRole('dialog', { name: 'Issues board', exact: true }).waitFor();
  await page.getByRole('button', { name: /Refresh/ }).click();
  assert.ok(await page.evaluate(() => window.sent.some(m=>m.t==='gh.refresh')));
  assert.deepEqual(errors, []);
  console.log('Asana wall, Issues entry, worker handoff and GitHub fallback passed');
} finally { await browser?.close(); vite.kill(); }
