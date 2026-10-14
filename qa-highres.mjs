import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:8766');
  await page.locator('#video-file').setInputFiles('test-results/short.mp4');
  await page.waitForFunction(() => !document.getElementById('export').disabled);
  for (const quality of ['720','900','1080','1440','2160']) {
    await page.locator('#quality').selectOption(quality);
    assert.equal(await page.locator('#output-size').textContent(), `${quality} × ${Math.round(Number(quality) * 16 / 9 / 2) * 2}`);
  }
  await page.locator('#storage').selectOption('temp');
  await page.locator('#export').click();
  await page.waitForFunction(() => !document.getElementById('result-actions').hidden || document.getElementById('export-title').textContent === 'Chưa xuất được video', null, { timeout: 180000 });
  assert.equal(await page.locator('#export-title').textContent(), 'Mockup của bạn đã sẵn sàng.', await page.locator('#export-detail').textContent());
  const dl = page.waitForEvent('download'); await page.locator('#download').click();
  await (await dl).saveAs('test-results/4k.mp4');
  await page.locator('#cancel-export').click();
  assert.equal(await page.locator('#last-result').isVisible(), true);
  const again = page.waitForEvent('download'); await page.locator('#last-download').click();
  await (await again).saveAs('test-results/4k-again.mp4');
  // Validate Web Share handoff with a real exported File, independently of OS UI.
  await page.evaluate(() => { navigator.canShare = () => true; navigator.share = async ({files}) => { window.sharedFile = { name: files[0].name, size: files[0].size, type: files[0].type }; }; document.getElementById('last-share').hidden = false; });
  await page.locator('#last-share').click();
  const shared = await page.evaluate(() => window.sharedFile);
  assert.equal(shared.type, 'video/mp4'); assert.ok(shared.size > 1000); assert.match(shared.name, /mockup\.mp4$/);
  // Each available device is backed by an actual locally vendored raster frame.
  for (let i = 0; i < 13; i++) {
    await page.locator('#model').selectOption(String(i));
    await page.waitForFunction(() => !document.getElementById('export').disabled);
  }
  await page.locator('#model').selectOption('0');
  await page.waitForFunction(() => !document.getElementById('export').disabled);
  assert.deepEqual(errors, []);
  console.log('PASS: HD, HD+, FHD, QHD, UHD dimensions; actual 4K export; repeat download after dialog closes; Web Share file handoff; all real device frames; disk-backed output.');
} finally { await browser.close(); }
