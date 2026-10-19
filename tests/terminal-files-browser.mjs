// Run with node tests/terminal-files-browser.mjs; CHROME_PATH overrides Chrome's location.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:5199';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5199', '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${origin}/login.html`)).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(vite.exitCode, null);
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  for (const mobile of [true, false]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    await page.route('**/files-harness', route => route.fulfill({ contentType: 'text/html', body: `
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/${mobile ? 'lite' : 'style'}.css">
      <body class="${mobile ? 'lite' : ''}"><div id="modal-root"></div><div id="toasts"></div>
      <script type="module">
        import {openTerminal,routeTerminalMessage} from '/ui/terminal.ts';
        import {store} from '/state/index.ts';
        store.floor='test';
        store.workers.set('w',{id:'w',kind:'shell',name:'File attachments',color:'#abcdef',status:'idle',viewers:[],viewerIds:[],cols:40,rows:24});
        window.messages=[];
        window.openTerminal=()=>{
          openTerminal({send:m=>{window.messages.push(m);if(m.t==='term.resize')Object.assign(store.workers.get('w'),{cols:m.cols,rows:m.rows});}},'w',undefined,undefined,{keypad:${mobile}});
          routeTerminalMessage({t:'term.snapshot',workerId:'w',data:'Ready for files',cols:40,rows:24});
        };
        window.firePaste=(selector,files,text='')=>{
          const data=new DataTransfer();
          for(const f of files)data.items.add(new File([f.size?new Uint8Array(f.size):f.body],f.name,{type:f.type}));
          if(text)data.setData('text/plain',text);
          const event=new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true});
          document.querySelector(selector).dispatchEvent(event);
          return event.defaultPrevented;
        };
        window.openTerminal();
      </script>` }));
    const uploads = [];
    let delayed;
    let fail = false;
    let delay = false;
    await page.route('**/api/term/drop?**', async route => {
      const request = route.request();
      const query = new URL(request.url()).searchParams;
      assert.equal(query.get('floor'), 'test');
      assert.equal(query.get('worker'), 'w');
      uploads.push({ name: query.get('name'), body: request.postDataBuffer()?.toString(), type: request.headers()['content-type'] });
      if (delay) { delayed = route; return; }
      if (fail) return route.fulfill({ status: 500, json: { error: 'Upload unavailable' } });
      await route.fulfill({ json: { path: `/tmp/my project/${query.get('name')}` } });
    });
    await page.goto(`${origin}/files-harness`);
    await page.waitForFunction(() => document.querySelector('.xterm-rows')?.textContent.includes('Ready for files'));
    const destination = mobile ? '.term-say input' : '.xterm-helper-textarea';
    const pdf = { name: 'report.pdf', type: 'application/pdf', body: '%PDF-1.7 test' };
    if (mobile) await page.locator(destination).fill('Review ');
    assert.equal(await page.evaluate(({destination,pdf})=>window.firePaste(destination,[pdf],'report.pdf'),{destination,pdf}),true,'file paste with filename text must upload, including the mobile prompt');
    await page.waitForFunction(() => document.querySelector('#toasts')?.textContent.includes('added'));
    assert.deepEqual(uploads, [{ name: 'report.pdf', body: pdf.body, type: 'application/pdf' }]);
    const inserted = '/tmp/my\\ project/report.pdf';
    if (mobile) {
      assert.equal(await page.locator(destination).inputValue(), `Review ${inserted} `);
      assert.equal(await page.evaluate(()=>window.messages.some(m=>m.t==='term.input'||m.t==='worker.prompt')),false,'mobile draft must not be sent before Send');
    } else {
      const input = await page.evaluate(()=>window.messages.filter(m=>m.t==='term.input').map(m=>m.data).join(''));
      assert.equal(input, `${inserted} `,'terminal gets escaped paths without Enter');
    }
    // General file picker must allow documents and images together.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Attach files', exact: true }).click()]);
    assert.equal(chooser.isMultiple(),true);
    assert.equal(await chooser.element().getAttribute('accept'),null);
    await chooser.setFiles([
      { name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('notes') },
      { name:'photo.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71]) },
    ]);
    await page.waitForFunction(() => !document.querySelector('button[title="Attach files"]')?.disabled);
    assert.deepEqual(uploads.map(u=>u.name),['report.pdf','notes.txt','photo.png']);
    if(mobile) {
      assert.match(await page.locator(destination).inputValue(),/notes\.txt .*photo\.png /);
      await page.locator('#toasts .toast').last().waitFor({state:'detached'});
      await page.screenshot({path:'/tmp/terminal-file-paste-mobile.png'});
      await page.getByRole('button',{name:'Send',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.t==='worker.prompt').length),1);
    }
    // Mixed clipboard files all upload once, even when the clipboard includes filename text.
    const mixed = [
      {name:'clipboard.png',type:'image/png',body:'image bytes'},
      {name:'unknown.dat',type:'',body:'binary payload'},
    ];
    await page.evaluate(mixed=>window.firePaste('.xterm-helper-textarea',mixed,'clipboard.png unknown.dat'),mixed);
    await page.waitForFunction(()=>window.messages.some(m=>m.t==='term.input'&&m.data.includes('unknown.dat')));
    assert.deepEqual(uploads.slice(-2).map(u=>u.name),['clipboard.png','unknown.dat']);
    assert.equal(uploads.at(-1).type,'application/octet-stream');
    // Moving drag-and-drop into the shared uploader must keep backdrop drops working.
    await page.evaluate(()=>{
      const data=new DataTransfer();data.items.add(new File(['dropped'],'dropped.txt',{type:'text/plain'}));
      document.querySelector('.backdrop').dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(()=>!document.querySelector('button[title="Attach files"]').disabled);
    assert.equal(uploads.at(-1).name,'dropped.txt');
    // Text-only paste stays native; pasted files are preferred over filename text.
    const count=uploads.length;
    await page.evaluate(()=>{window.messages=[];});
    const textHandled = await page.evaluate(destination=>window.firePaste(destination,[],'ordinary text'),destination);
    if(mobile) assert.equal(textHandled,false,'plain text in the mobile draft stays native');
    assert.equal(uploads.length,count);
    if(!mobile) assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.t==='term.input').map(m=>m.data).join('')),'ordinary text');
    const oversized={name:'too-large.pdf',type:'application/pdf',size:25*1024*1024+1};
    await page.evaluate(({destination,oversized})=>window.firePaste(destination,[oversized]),{destination,oversized});
    await page.waitForFunction(()=>document.querySelector('#toasts')?.textContent.includes('25 MB'));
    assert.equal(uploads.length,count,'oversized files must not upload');
    const beforeFailure = await page.evaluate(()=>JSON.stringify(window.messages));
    fail=true;
    await page.evaluate(({destination,pdf})=>window.firePaste(destination,[pdf]),{destination,pdf});
    await page.waitForFunction(()=>document.querySelector('#toasts')?.textContent.includes('Upload unavailable'));
    assert.equal(await page.evaluate(()=>JSON.stringify(window.messages)),beforeFailure,'failed upload must not insert or submit');
    fail=false;
    delay=true;
    await page.evaluate(({destination,pdf})=>window.firePaste(destination,[pdf]),{destination,pdf});
    for(let i=0;i<100&&!delayed;i++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(delayed);
    const uploadCount=uploads.length;
    await page.evaluate(({destination,pdf})=>window.firePaste(destination,[pdf]),{destination,pdf});
    await page.waitForFunction(()=>document.querySelector('#toasts')?.textContent.includes('Wait for the current file upload'));
    assert.equal(uploads.length,uploadCount,'busy upload must not duplicate files');
    const sent=await page.evaluate(()=>window.messages.length);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    const afterClose=await page.evaluate(()=>window.messages.length);
    assert.ok(afterClose>=sent);
    await delayed.fulfill({json:{path:'/tmp/stale.pdf'}}).catch(()=>{});
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.messages.length),afterClose,'closing cancels upload insertion');
    await page.close();
  }
  console.log('File paste, mobile drafts, general file picker, image compatibility, size/error handling and close-during-upload passed.');
} finally { await browser?.close(); vite.kill('SIGTERM'); }
