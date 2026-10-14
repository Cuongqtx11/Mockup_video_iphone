import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle'});
  for(let i=0;i<12;i++) {
    await page.locator('#video-file').setInputFiles(i%2?'test-results/short.mp4':'test-results/input.mp4');
    await page.waitForFunction(()=>!document.getElementById('export').disabled&&document.getElementById('source-video').readyState>=2,null,{timeout:25000});
    assert.equal(await page.locator('#file-name').textContent(),i%2?'short.mp4':'input.mp4');
    if(i%3===2) await page.reload({waitUntil:'networkidle'});
  }
  console.log('PASS: 12 video loads/replacements across fresh page reloads, actual decoded first frame.');
} finally {await browser.close();}
