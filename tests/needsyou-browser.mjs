// Fixture-only check: CHROME_PATH=/path/to/chrome node tests/needsyou-browser.mjs.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const officeHtml = await readFile(new URL('../src/client/index.html', import.meta.url), 'utf8');
const waitingButton = officeHtml.match(/<button id="waiting"[^>]*><\/button>/)[0];

const port = 5184;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (vite.exitCode !== null) break;
    try { ready = (await fetch(`http://127.0.0.1:${port}/login.html`)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Vite could not listen on the fixture port');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/needsyou-harness', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <link rel="stylesheet" href="/style.css">
    <div id="hud"><aside class="side"><section id="workers-panel" class="panel workers"><h3>Workers <span id="worker-count"></span></h3>${waitingButton}<ul id="workers"></ul></section></aside></div>
    <div id="badge-preview" style="position:absolute;left:24px;top:40px;width:340px;display:grid;gap:20px"></div><div id="modal-root"></div><div id="toasts"></div>
    <script type="module">
      import * as THREE from '/@fs/${process.cwd()}/node_modules/three/build/three.module.js';
      import { installNeedsYou } from '/features/needsyou/index.ts';
      import { renderWorkers } from '/ui/workers-panel.ts';
      import { bubbleFor } from '/world/character/worker-badges.ts';
      import { waitingLabel } from '/nextup.ts';
      import { DesktopNotifier } from '/notify.ts';
      import { openSettings } from '/ui/settings.ts';
      import { loadSettings, store } from '/state/index.ts';
      window.alerts = []; window.notifications = []; window.opened = [];
      window.badgeText = [];
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, ...args) {
        window.badgeText.push(text); return fillText.call(this, text, ...args);
      };
      window.drawWaitingBadges = () => {
        for (const task of [undefined, { name: 'Test changes', summary: 'Waiting for permission' }]) {
          const sprite = bubbleFor('needs_input', false, task, undefined, false).draw();
          const canvas = sprite.material.map.image;
          canvas.style.width = '100%'; canvas.style.height = 'auto';
          document.getElementById('badge-preview').append(canvas);
          sprite.material.map.dispose(); sprite.material.dispose();
        }
        return window.badgeText;
      };
      window.waitingCount = () => waitingLabel([...store.workers.values()]);
      window.Notification = class {
        static permission = 'granted';
        constructor(title) { window.notifications.push(title); }
        close() {}
      };
      document.hasFocus = () => false;
      const worker = (name, status) => ({ id: name, name, status, deskId: 'desk-1', color: '#06d6a0', kind: 'agent', provider: 'codex', createdAt: Date.now(), waitingSince: Date.now(), viewers: [], acked: false });
      store.workers = new Map(['Byte', 'Nib'].map(name => [name, worker(name, 'working')]));
      const scene = new THREE.Scene();
      window.feature = installNeedsYou({ scene, camera: new THREE.PerspectiveCamera(), sound: { needsYou: () => window.alerts.push('alarm') }, settings: { needsYouSound: 'remind' }, player: { pos: new THREE.Vector3() }, reduceMotion: { matches: false }, ticks: { add() {} } }, { views: { workerViews: new Map() }, waiting: { goToWorker() {} } });
      const notifier = new DesktopNotifier(() => true, id => window.opened.push(id));
      window.settings = () => openSettings({ send() {} }, loadSettings(), () => {}, () => {}, { ding() {} }, notifier, () => {}, undefined, 'sound');
      const paint = () => renderWorkers(id => window.opened.push(id));
      store.on('workers', paint);
      store.emit('workers');
      window.ask = () => {
        for (const w of store.workers.values()) {
          w.status = 'needs_input'; w.activity = 'Waiting for permission to run tests';
          notifier.alert(w);
        }
        store.emit('workers');
      };
      window.otherFloor = () => {
        store.floor = 'another-floor'; store.emit('floor');
        store.workers = new Map([['Pip', worker('Pip', 'needs_input')]]);
        notifier.alert(store.workers.get('Pip')); store.emit('workers');
      };
      window.finished = () => {
        const w = store.workers.get('Pip'); w.status = 'done'; w.activity = undefined;
        notifier.alert(w); store.emit('workers');
      };
      window.ready = true;
    </script>` }));
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${port}/needsyou-harness`);
  await page.waitForFunction(() => window.ready);
  await page.evaluate(() => window.ask());
  assert.equal(await page.locator('.needs-you:not(.hidden)').count(), 0, 'Needs you banner must be hidden');
  assert.equal(await page.locator('.needs-you-flash.on').count(), 0, 'Screen must not flash');
  assert.equal(await page.evaluate(() => window.feature.beacons.size), 0, 'No attention beacons');
  assert.deepEqual(await page.evaluate(() => window.alerts), [], 'No Needs you alarm');
  assert.deepEqual(await page.evaluate(() => window.notifications), [], 'No Needs you desktop notifications');
  assert.equal(await page.locator('#workers .pill.needs_input').count(), 2, 'Waiting statuses remain accurate');
  assert.deepEqual(await page.locator('#workers .pill.needs_input').allTextContents(), ['WAITING', 'WAITING']);
  assert.ok(!(await page.locator('#workers').innerText()).toLowerCase().includes('needs you'));
  assert.ok(!(await page.locator('#workers li').first().getAttribute('title')).includes('needs you'));
  assert.equal(await page.evaluate(() => window.waitingCount()), '🙋 2 waiting');
  assert.ok(!/needs? you/i.test(await page.locator('#waiting').getAttribute('title')), 'Production waiting button uses neutral wording');
  const badgeText = await page.evaluate(() => window.drawWaitingBadges());
  assert.equal(badgeText.filter(text => text === '🙋 WAITING').length, 2, 'Bubble and task card both say Waiting');
  assert.ok(!badgeText.some(text => /needs? you/i.test(text)), 'Badges must not say Needs you');
  await page.locator('#workers li').first().click();
  assert.deepEqual(await page.evaluate(() => window.opened), ['Byte'], 'Workers remain accessible');
  await page.clock.fastForward(60_001);
  assert.deepEqual(await page.evaluate(() => window.alerts), [], 'No recurring Needs you alarm');
  await page.screenshot({ path: '/tmp/agent-office-no-needs-you.png' });
  await page.evaluate(() => window.otherFloor());
  assert.equal(await page.locator('.needs-you:not(.hidden)').count(), 0, 'Changing floors must not restore alerts');
  assert.equal(await page.evaluate(() => window.feature.beacons.size), 0);
  assert.deepEqual(await page.evaluate(() => window.notifications), []);
  assert.equal(await page.locator('#workers .pill.needs_input').count(), 1);
  await page.evaluate(() => window.finished());
  assert.deepEqual(await page.evaluate(() => window.notifications), ['✅ Pip is done'], 'Finished-worker notifications remain available');
  assert.equal(await page.locator('#workers .pill.done').count(), 1);
  await page.evaluate(() => window.settings());
  await page.getByRole('dialog', { name: 'Settings', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'When a worker needs you', exact: true }).count(), 0, 'Removed alarms have no Settings control');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  assert.deepEqual(errors, []);
  console.log('Waiting labels verified on bubbles, task cards, status pills and counts; alerts hidden and worker access and done notifications preserved.');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
