import {chromium,webkit} from 'playwright-core';
import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:8766/';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
const errors=[];
async function ready(context,fixture='test-results/input.mp4'){
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base,{waitUntil:'networkidle'});
  await p.locator('#video-file').setInputFiles(fixture);await p.waitForFunction(()=>!document.getElementById('export').disabled);
  await p.locator('#storage').selectOption('temp');await p.locator('#quality').selectOption('720');return p;
}
async function complete(p){await p.waitForFunction(()=>!document.getElementById('result-actions').hidden||document.getElementById('export-title').textContent==='Chưa xuất được video',null,{timeout:90000});assert.equal(await p.locator('#export-title').textContent(),'Mockup của bạn đã sẵn sàng.',await p.locator('#export-detail').textContent());}
try{
  let c=await browser.newContext();
  await c.addInitScript(()=>HTMLMediaElement.prototype.load=function(){});
  let p=await ready(c);assert.match(await p.locator('#file-details').textContent(),/360 × 780/);
  console.log('PASS: metadata import without native loadedmetadata/loadeddata');await c.close();

  c=await browser.newContext();p=await ready(c);
  for(let i=0;i<8;i++)await p.locator('#video-file').setInputFiles(i%2?'test-results/short.mp4':'test-results/input.mp4');
  await p.waitForFunction(()=>document.getElementById('file-details').textContent.includes('360 × 780')&&!document.getElementById('export').disabled);
  assert.equal(await p.locator('#file-name').textContent(),'short.mp4');await p.waitForTimeout(600);
  assert.equal(await p.locator('#file-name').textContent(),'short.mp4');console.log('PASS: rapid replacement keeps only final source');await c.close();

  c=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'});
  p=await ready(c,'test-results/long.mp4');
  await p.locator('#add-text').click();await p.locator('#text-content').fill('LƯU VÀO ẢNH');await p.locator('#text-template').selectOption('poster');
  const workers=[];p.on('worker',w=>workers.push(w.url()));
  await p.locator('#export').click();await p.waitForFunction(()=>document.getElementById('progress').value>.05);
  await p.locator('#cancel-export').click();assert.equal(await p.locator('#export-dialog').evaluate(d=>d.open),false);
  await p.locator('#export').click();await complete(p);
  assert.equal(workers.some(u=>u.includes('export-worker')),false,'iPhone auto uses compatible sequential encoding, not worker conversion');
  await p.locator('#result-preview').evaluate(v=>v.play());await p.waitForFunction(()=>document.getElementById('result-preview').currentTime>1.2);await p.locator('#result-preview').evaluate(v=>v.pause());
  const dl=p.waitForEvent('download');await p.locator('#download').click();await(await dl).saveAs('test-results/stable-mobile.mp4');
  await p.evaluate(()=>{navigator.canShare=()=>true;navigator.share=data=>{window.shareCheck={active:navigator.userActivation.isActive,size:data.files[0].size,type:data.files[0].type,name:data.files[0].name,keys:Object.keys(data)};return new Promise(()=>{});};});
  await p.locator('#share').click();const share=await p.evaluate(()=>window.shareCheck);assert.equal(share.active,true);assert.equal(share.type,'video/mp4');assert.ok(share.size>1000);assert.deepEqual(share.keys,['files']);
  assert.equal(await p.evaluate(()=>document.body.classList.contains('exporting')),false);
  console.log('PASS: mobile auto, cancel/retry, 12-second MP4 playback/download, direct File share with user gesture; unresolved share does not lock editor',share);
  await c.close();

  c=await browser.newContext();p=await ready(c);
  await p.route('**/export-worker-*.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+"\nself.onmessage=()=>self.postMessage({type:'error',message:'The operation failed for an unknown transient reason (e.g. out of memory).'});"});});
  await p.locator('#export').click();await complete(p);console.log('PASS: transient worker failure automatically retries compatible route');await c.close();
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
// Linux WebKit lacks MediaRecorder here. Verify the actual WebKit import path
// independently of native media decoder availability; this is not iOS emulation.
if(!process.env.BASE_URL){const w=await webkit.launch();try{const p=await w.newPage();await p.addInitScript(()=>HTMLMediaElement.prototype.load=function(){});await p.goto(base,{waitUntil:'networkidle'});for(let i=0;i<4;i++){await p.locator('#video-file').setInputFiles(i%2?'test-results/short.mp4':'test-results/input.mp4');await p.waitForFunction(()=>!document.getElementById('export').disabled);assert.match(await p.locator('#file-details').textContent(),/360 × 780/);}console.log('PASS: actual WebKit parses/replaces MP4 with native decoder disabled');}finally{await w.close();}}
