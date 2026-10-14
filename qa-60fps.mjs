import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
const base=process.env.BASE_URL||'http://127.0.0.1:8766/';
try{
  const page=await browser.newPage({viewport:{width:1280,height:960}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});
  await page.locator('#video-file').setInputFiles('test-results/source-60fps.mp4');await page.waitForFunction(()=>!document.getElementById('export').disabled);
  await page.locator('#storage').selectOption('temp');await page.locator('#fps').selectOption('60');
  for(const [quality,label,method] of [['1440','2k60','stable'],['2160','4k60',process.env.BASE_URL?'stable':'fast']]){
    await page.locator('#quality').selectOption(quality);await page.locator('#processing').selectOption(method);
    const started=Date.now();await page.locator('#export').click();
    // Prove cancellation while high-resolution frames are actually being processed.
    await page.waitForFunction(()=>document.getElementById('progress').value>.05||document.getElementById('export-title').textContent==='Chưa xuất được video',null,{timeout:120000});
    assert.notEqual(await page.locator('#export-title').textContent(),'Chưa xuất được video',await page.locator('#export-detail').textContent());
    await page.locator('#cancel-export').click();assert.equal(await page.locator('#export-dialog').evaluate(d=>d.open),false);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('exporting')),false);
    await page.locator('#export').click();
    await page.waitForFunction(()=>!document.getElementById('result-actions').hidden||document.getElementById('export-title').textContent==='Chưa xuất được video',null,{timeout:300000});
    assert.equal(await page.locator('#export-title').textContent(),'Mockup của bạn đã sẵn sàng.',await page.locator('#export-detail').textContent());
    await page.locator('#result-preview').evaluate(v=>v.play());await page.waitForFunction(()=>document.getElementById('result-preview').currentTime>.6);await page.locator('#result-preview').evaluate(v=>v.pause());
    const dl=page.waitForEvent('download');await page.locator('#download').click();const download=await dl;const path=`test-results/${process.env.BASE_URL?'live-':''}${label}.mp4`;await download.saveAs(path);assert.equal(await download.failure(),null);
    const meta=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=codec_name,codec_type,width,height,avg_frame_rate,nb_read_frames','-show_entries','format=duration,size','-of','json',path],{encoding:'utf8'}));
    const video=meta.streams.find(s=>s.codec_type==='video'),audio=meta.streams.find(s=>s.codec_type==='audio');
    assert.equal(video.width,Number(quality));assert.equal(video.height,Math.round(Number(quality)*16/9/2)*2);assert.equal(video.avg_frame_rate,'60/1');assert.equal(Number(video.nb_read_frames),180);assert.equal(video.codec_name,'h264');assert.equal(audio.codec_name,'aac');assert.equal(Number(meta.format.duration),3);
    const hashes=execFileSync('ffmpeg',['-v','error','-i',path,'-map','0:v:0','-frames:v','30','-vf','scale=180:320','-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').at(-1).trim());
    assert.ok(new Set(hashes).size>=25,'Actual decoded motion must change on almost every frame; not just a 60fps tag');
    console.log('PASS',label,JSON.stringify(video),`180 frames / 3s; decoded movement; AAC; cancel/retry; download; elapsed ${((Date.now()-started)/1000).toFixed(1)}s including cancellation and QA`);
    await page.locator('#cancel-export').click();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
