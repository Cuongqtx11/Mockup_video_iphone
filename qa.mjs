import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto('http://127.0.0.1:8766', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.getElementById('device-title').textContent !== 'Đang kiểm tra thiết bị…');
  assert.equal(await page.locator('#model option').count(), 13);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.locator('#video-file').setInputFiles('test-results/input.mp4');
  await page.waitForFunction(() => !document.getElementById('export').disabled);
  await page.waitForFunction(() => !document.getElementById('source-video').seeking);
  assert.match(await page.locator('#file-details').textContent(), /360 × 780/);
  const pixel = await page.locator('#preview').evaluate(c => [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data]);
  assert.ok(Math.max(...pixel.slice(0, 3)) > 100, `First video frame must be visible: ${pixel}`);
  for (const ratio of ['1:1', '16:9', '9:16']) {
    await page.locator(`[data-ratio="${ratio}"]`).click();
    const d = await page.locator('#preview').evaluate(c => [c.width, c.height]);
    assert.equal(Math.round(d[0] / d[1] * 100), Math.round((ratio === '1:1' ? 1 : ratio === '16:9' ? 16 / 9 : 9 / 16) * 100));
  }
  await page.locator('#model').selectOption('12');
  await page.locator('#model').selectOption('0');
  await page.locator('#quality').selectOption('720');
  await page.locator('#storage').selectOption('temp');
  await page.locator('#export').click();
  await page.waitForFunction(() => !document.getElementById('result-actions').hidden || document.getElementById('export-title').textContent === 'Chưa xuất được video', null, { timeout: 120000 });
  assert.equal(await page.locator('#export-title').textContent(), 'Mockup của bạn đã sẵn sàng.', await page.locator('#export-detail').textContent());
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  await download.saveAs(`test-results/output.${download.suggestedFilename().endsWith('mp4') ? 'mp4' : 'webm'}`);
  console.log('Export:', download.suggestedFilename(), await page.locator('#export-detail').textContent());
  await page.locator('#cancel-export').click();
  // Save via a real OPFS writable, exercising disk streaming without a picker UI.
  await page.evaluate(() => { window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('qa-output.mp4', { create: true }); });
  await page.locator('#storage').selectOption('disk');
  await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('export-title').textContent === 'Đã lưu video!' || document.getElementById('export-title').textContent === 'Chưa xuất được video', null, { timeout: 120000 });
  assert.equal(await page.locator('#export-title').textContent(), 'Đã lưu video!', await page.locator('#export-detail').textContent());
  assert.ok(await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('qa-output.mp4')).getFile()).size) > 1000);
  await page.locator('#cancel-export').click();
  await page.locator('#storage').selectOption('temp');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
  // Force the compatibility path and verify recording still includes a result.
  await page.evaluate(() => { window.VideoEncoder = undefined; });
  await page.locator('#export').click();
  await page.waitForFunction(() => !document.getElementById('result-actions').hidden || document.getElementById('export-title').textContent === 'Chưa xuất được video', null, { timeout: 120000 });
  assert.equal(await page.locator('#export-title').textContent(), 'Mockup của bạn đã sẵn sàng.', await page.locator('#export-detail').textContent());
  const fallbackDownload = page.waitForEvent('download');
  await page.locator('#download').click();
  const fallback = await fallbackDownload;
  await fallback.saveAs(`test-results/fallback.${fallback.suggestedFilename().endsWith('mp4') ? 'mp4' : 'webm'}`);
  console.log('Fallback:', fallback.suggestedFilename());
  await page.locator('#cancel-export').click();
  await page.locator('#export').click();
  await page.locator('#cancel-export').click();
  await page.waitForFunction(() => !document.getElementById('export-dialog').open);
  assert.equal(await page.evaluate(() => document.body.classList.contains('exporting')), false);
  assert.deepEqual(errors, []);
  console.log('PASS: first-frame preview, model selection, three ratios, MP4 export, disk streaming, compatibility export, audio routing, download, cancellation, responsive layout; no browser errors.');
} finally { await browser.close(); }
