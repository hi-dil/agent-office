import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5183','--strictPort'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5183/login.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1400,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/tools-harness',route=>route.fulfill({contentType:'text/html',body:`<style>body{margin:0}</style><div id="modal-root"></div><div id="toasts"></div><script type="module">
 import * as THREE from '/@fs/${process.cwd()}/node_modules/three/build/three.module.js';
 import {buildOffice} from '/world/office.ts';import {LazygitBoardTexture} from '/world/boards.ts';import {PlanLimitsTexture} from '/world/plan-limits.ts';import {openPlanLimits} from '/ui/limits.ts';import {store} from '/state.ts';
 const office=buildOffice();const scene=new THREE.Scene();scene.background=new THREE.Color('#d7e1e0');scene.add(office.group);scene.add(new THREE.HemisphereLight(0xffffff,0xaaaaaa,3));
 const git=new LazygitBoardTexture();git.render({branch:'main',changed:12,staged:2,unstaged:7,untracked:3,conflicts:0,ahead:4,behind:1,upstream:'origin/main',fetchedAt:Date.now()-60000,at:Date.now()});const limits=new PlanLimitsTexture();store.limits={windows:[{label:'Week',pct:63,resetsAt:Date.now()+86400000}],at:Date.now(),codex:{windows:[{label:'Week',pct:17,resetsAt:Date.now()+86400000*4}],at:Date.now()}};limits.render(store.limits);
 office.boardMeshes.lazygit.material=new THREE.MeshBasicMaterial({map:git.texture});office.boardMeshes.limits.material=new THREE.MeshBasicMaterial({map:limits.texture});
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1400,1000);document.body.append(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(65,1.4,.1,200);camera.position.set(10.7,3.7,-4);camera.lookAt(16.8,3.4,-10.6);renderer.render(scene,camera);
 window.kinds=office.interactables.map(i=>i.kind);window.openLimits=()=>openPlanLimits({send:m=>window.request=m});window.ready=true;
 </script>`}));
 await page.goto('http://127.0.0.1:5183/tools-harness');await page.waitForFunction(()=>window.ready);
 assert.ok((await page.evaluate(()=>window.kinds)).includes('lazygit'));assert.ok((await page.evaluate(()=>window.kinds)).includes('limits'));
 await page.screenshot({path:'/tmp/agent-office-tools-corner.png'});
 await page.evaluate(()=>window.openLimits());
 await page.getByRole('dialog',{name:'Weekly limits'}).waitFor();
 assert.equal(await page.getByText('Week: 17% used',{exact:false}).count(),1);
 assert.equal(await page.getByText('Week: 63% used',{exact:false}).count(),1);
 assert.equal((await page.evaluate(()=>window.request)).t,'limits.refresh');
 assert.deepEqual(errors,[]);
 console.log('Office boards render, expose interactions, and show both provider limits.');
}finally{await browser?.close();vite.kill('SIGTERM');}
