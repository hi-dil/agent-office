import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:5179/login.html')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.route('**/image-harness', route => route.fulfill({ contentType: 'text/html', body: `<div id="host"><textarea></textarea></div><button>Attach</button><script type="module">
  import {bindTerminalImages} from '/ui/terminal-images.ts'; window.pasted=[];window.notices=[];
  window.dispose=bindTerminalImages(document.querySelector('#host'),document.querySelector('button'),{floor:'shrm',worker:'worker1',active:()=>true,paste:s=>window.pasted.push(s),notice:s=>window.notices.push(s)});
  window.fire=(image)=>{const data=new DataTransfer();if(image)data.items.add(new File([new Uint8Array([137,80,78,71])],'test.png',{type:'image/png'}));else data.setData('text/plain','hello');const e=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});document.querySelector('textarea').dispatchEvent(e);return e.defaultPrevented;};
  </script>` }));
  let count = 0;
  let delayed;
  await page.route('**/api/terminal/image?**', async route => {
    count++;
    assert.equal(new URL(route.request().url()).searchParams.get('floor'), 'shrm');
    assert.equal(route.request().postDataJSON().type, 'image/png');
    if (count === 2) { delayed = route; return; }
    await route.fulfill({ json: { path: '/tmp/project/.agent-office/attachments/test.png' } });
  });
  await page.goto('http://127.0.0.1:5179/image-harness');
  await page.waitForFunction(() => !!window.fire);
  assert.equal(await page.evaluate(() => window.fire(false)), false);
  assert.equal(count, 0);
  assert.equal(await page.evaluate(() => window.fire(true)), true);
  await page.waitForFunction(() => window.pasted.length === 1);
  assert.equal(await page.evaluate(() => window.pasted[0]), "'/tmp/project/.agent-office/attachments/test.png' ");
  await page.evaluate(() => window.fire(true));
  for (let i=0; i<50 && !delayed; i++) await new Promise(r=>setTimeout(r,20));
  assert.ok(delayed);
  await page.evaluate(() => window.dispose());
  await delayed.fulfill({ json: { path: '/tmp/stale.png' } }).catch(() => {});
  assert.equal(await page.evaluate(() => window.pasted.length), 1);
  console.log('Browser image paste, text passthrough, and close-during-upload checks passed');
} finally {
  await browser?.close();
  vite.kill('SIGTERM');
}
