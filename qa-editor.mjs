import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8766/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('#backgrounds button').count(),18);
  assert.equal(await page.locator('#storage option[value=ram]').count(),0);
  await page.locator('#video-file').setInputFiles('test-results/input.mp4');
  await page.waitForFunction(()=>!document.getElementById('export').disabled,null,{timeout:60000});
  await page.locator('#scale').evaluate(el=>{el.value=200;el.dispatchEvent(new Event('input'));});
  assert.equal(await page.locator('#scale-value').textContent(),'200%');
  const zoomed=await page.locator('#preview').evaluate(c=>[...c.getContext('2d').getImageData(5,c.height/2,1,1).data]);
  assert.ok(zoomed[0]!==zoomed[1]||zoomed[1]!==zoomed[2],'200% phone reaches the canvas edge instead of being capped');
  await page.locator('#scale').evaluate(el=>{el.value=78;el.dispatchEvent(new Event('input'));});
  await page.locator('#backgrounds button[title="Aurora"]').click();
  await page.locator('#quick-add-text').click();
  await page.locator('#text-content').fill('THÀNH HÌNH');
  for(const template of ['editorial','poster','neon','glass','shimmer','clean']){
    await page.locator('#text-template').selectOption(template);
    assert.notEqual(await page.locator('#text-font').inputValue(),'');
  }
  await page.locator('#text-stretch-x').evaluate(el=>{el.value=150;el.dispatchEvent(new Event('input'));});
  await page.locator('#text-stretch-y').evaluate(el=>{el.value=125;el.dispatchEvent(new Event('input'));});
  assert.equal(await page.locator('#text-stretch-x-value').textContent(),'150%');
  const rect=await page.locator('#preview').boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height*.12);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.58,rect.y+rect.height*.17,{steps:5});await page.mouse.up();
  assert.ok(Number(await page.locator('#text-y').inputValue())>12,'Text can be dragged');
  await page.locator('#add-text').click();assert.equal(await page.locator('#text-layer option').count(),2);
  await page.locator('#delete-text').click();assert.equal(await page.locator('#text-layer option').count(),1);
  await page.locator('#text-stretch-x').evaluate(el=>{el.value=100;el.dispatchEvent(new Event('input'));});
  await page.locator('#text-stretch-y').evaluate(el=>{el.value=100;el.dispatchEvent(new Event('input'));});
  await page.locator('#text-y').evaluate(el=>{el.value=5;el.dispatchEvent(new Event('input'));});
  await page.locator('#text-x').evaluate(el=>{el.value=50;el.dispatchEvent(new Event('input'));});
  await page.locator('#text-animation').selectOption('fade');
  await page.locator('#storage').selectOption('temp');await page.locator('#quality').selectOption('720');
  await page.locator('#play').click();await page.waitForTimeout(900);await page.locator('#play').click();
  await page.screenshot({path:'test-results/editor-desktop.png',fullPage:true});
  await page.locator('#export').click();await page.waitForFunction(()=>!document.getElementById('result-actions').hidden||document.getElementById('export-title').textContent==='Chưa xuất được video',null,{timeout:120000});
  assert.equal(await page.locator('#export-title').textContent(),'Mockup của bạn đã sẵn sàng.',await page.locator('#export-detail').textContent());
  await page.waitForFunction(()=>document.getElementById('download').href.includes('local-video'));const url=await page.locator('#download').getAttribute('href');assert.match(url,/local-video/);
  assert.equal(await page.locator('#download').getAttribute('download'),null,'Streamed downloads must use HTTP headers, not the download attribute');
  const range=await page.evaluate(async url=>{const r=await fetch(url,{headers:{Range:'bytes=0-31'}});return{status:r.status,length:(await r.arrayBuffer()).byteLength,range:r.headers.get('Content-Range')};},url);
  assert.equal(range.status,206);assert.equal(range.length,32);
  const dl=page.waitForEvent('download');await page.locator('#download').click();await(await dl).saveAs('test-results/text-animation.mp4');
  await page.locator('#cancel-export').click();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/editor-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Force the older-Safari disk writer, without changing the encoding path.
  await page.evaluate(()=>{FileSystemFileHandle.prototype.createWritable=undefined;});
  await page.locator('#export').click();await page.waitForFunction(()=>!document.getElementById('result-actions').hidden||document.getElementById('export-title').textContent==='Chưa xuất được video',null,{timeout:120000});
  assert.equal(await page.locator('#export-title').textContent(),'Mockup của bạn đã sẵn sàng.',await page.locator('#export-detail').textContent());
  const workerDl=page.waitForEvent('download');await page.locator('#download').click();await(await workerDl).saveAs('test-results/worker-disk.mp4');
  assert.deepEqual(errors,[]);
  console.log('PASS: 200% without cap, 18 backgrounds, font templates, stretching, canvas drag, multiple layers, animated text export, streamed file download, HTTP Range, mobile layout, sync OPFS worker path.');
}finally{await browser.close();}
