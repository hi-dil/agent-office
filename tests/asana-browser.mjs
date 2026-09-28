// Run with: node tests/asana-browser.mjs (Chrome installed locally; fixture Asana data only).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const port = 5178;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/login.html`)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.setDefaultTimeout(6000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let connected = false;
  let failRefresh = false;
  const task = { gid: '9001', name: 'Fix payroll', notes: '<script>window.hacked=true</script>\nKeep existing approvals.', url: 'https://app.asana.com/0/1217014847874353/9001', section: 'Ready', assignee: 'Aida', dueOn: '2026-10-01' };
  await page.route('**/asana-harness', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="modal-root"></div><div id="toasts"></div><script type="module">import {openAsanaBoard} from '/ui/asana.ts'; import {store} from '/state.ts'; window.store=store;store.floor='shrm';store.me={admin:true};store.project={name:'SHRM',defaultProvider:'codex',agentProviders:['codex'],dir:'/test',agentCmd:'codex'};window.openBoard=()=>openAsanaBoard({assign:(prompt,title)=>window.handoff={prompt,title},queue:(prompt,title,provider)=>window.queued={prompt,title,provider}});openBoard();</script></body></html>` }));
  await page.route('**/api/asana**', async route => {
    const req = route.request();
    assert.equal(new URL(req.url()).searchParams.get('floor'), 'shrm');
    if (req.method() === 'POST' && !req.url().includes('/refresh')) {
      const body = req.postDataJSON(); assert.equal(body.project, '1217014847874353'); assert.equal(body.token, 'test-token'); connected = true;
    }
    if (req.method() === 'DELETE') connected = false;
    await route.fulfill({ json: { project: { gid: '1217014847874353', name: 'SHRM', url: 'https://app.asana.com/0/1217014847874353/list' }, hasToken: connected, items: connected ? [task] : [], fetchedAt: connected ? Date.now() : 0, loading: false, truncated: false, ...(failRefresh ? { error: 'Asana rate limit reached. Wait 90 seconds before refreshing.' } : {}) } });
  });
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${port}/asana-harness`);
  await page.getByLabel('Personal access token').fill('test-token');
  await page.getByRole('button', { name: 'Connect Asana', exact: true }).click();
  await page.getByRole('button', { name: /Fix payroll/ }).click();
  assert.equal(await page.getByText('<script>window.hacked=true</script>', { exact: false }).count(), 1);
  assert.equal(await page.evaluate(() => window.hacked), undefined);
  await page.getByRole('button', { name: 'Hand to worker', exact: true }).click();
  assert.match((await page.evaluate(() => window.handoff)).prompt, /Keep existing approvals/);
  assert.match((await page.evaluate(() => window.handoff)).prompt, /https:\/\/app.asana.com/);
  await page.getByRole('button', { name: /Fix payroll/ }).click();
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  // The existing prompt editor lets the user choose the provider and edit before sending.
  await page.getByRole('button', { name: /Send|Hire|Queue/ }).last().click();
  await page.waitForFunction(() => !!window.queued);
  assert.equal((await page.evaluate(() => window.queued)).provider, 'codex');
  // Another admin disconnects while an editable queue handoff is open.
  await page.evaluate(() => { window.queued = undefined; });
  await page.getByRole('button', { name: /Fix payroll/ }).click();
  await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
  connected = false;
  await page.clock.fastForward(90_001);
  await page.getByRole('button', { name: 'Connect Asana', exact: true }).waitFor({ state: 'attached' });
  await page.getByRole('button', { name: /Send|Hire|Queue/ }).last().click();
  assert.equal(await page.evaluate(() => window.queued), undefined, 'a disconnected task cannot be queued from its old editor');
  connected = true;
  await page.reload();
  await page.getByRole('button', { name: /Fix payroll/ }).waitFor();
  failRefresh = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'rate limit' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Fix payroll/ }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Connection', exact: true }).click();
  assert.equal(await page.getByLabel('Personal access token').inputValue(), '');
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('button', { name: 'Connect Asana', exact: true }).waitFor();
  await page.evaluate(() => { store.floor = 'elsewhere'; store.emit('floor'); });
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Asana browser smoke passed: setup, safe rendering, worker handoff, editable queue, errors, mobile, disconnect, floor switch.');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
