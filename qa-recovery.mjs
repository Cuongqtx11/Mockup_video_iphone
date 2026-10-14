import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
const base = process.env.BASE_URL || 'http://127.0.0.1:8766/';
const errors = [];
async function ready(init, fixture = 'test-results/input.mp4') {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror', e => errors.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#video-file').setInputFiles(fixture);
  try { await page.waitForFunction(() => !document.getElementById('export').disabled); } catch(error) { console.log('LOAD FAILURE', await page.evaluate(()=>({toast:document.getElementById('toast').textContent,details:document.getElementById('file-details').textContent,videoState:document.getElementById('source-video').readyState,videoError:document.getElementById('source-video').error?.message,src:document.getElementById('source-video').getAttribute('src')}))); throw error; }
  await page.locator('#quality').selectOption('720'); await page.locator('#storage').selectOption('temp');
  return page;
}
async function completed(page) {
  await page.waitForFunction(() => !document.getElementById('result-actions').hidden || document.getElementById('export-title').textContent === 'Chưa xuất được video', null, {timeout:120000});
  assert.equal(await page.locator('#export-title').textContent(), 'Mockup của bạn đã sẵn sàng.', await page.locator('#export-detail').textContent());
}
async function cancel(page, label) {
  await page.evaluate(() => {
    const button = document.getElementById('cancel-export');
    button.addEventListener('click', () => { window.cancelStartedAt = performance.now(); }, {capture:true,once:true});
    button.addEventListener('click', () => { window.cancelHandlerMs = performance.now() - window.cancelStartedAt; }, {once:true});
  });
  await page.locator('#cancel-export').click();
  await page.waitForFunction(() => !document.getElementById('export-dialog').open && !document.body.classList.contains('exporting'), null, {timeout:3000});
  const duration = await page.evaluate(() => window.cancelHandlerMs);
  assert.ok(duration < 1000, `${label}: cancel handler blocked for ${duration}ms`);
  assert.equal(await page.locator('#cancel-export').isDisabled(), false);
  console.log('Cancel restored UI:', label, Math.round(duration), 'ms in button handler');
}
try {
  let page = await ready();
  await page.evaluate(() => { window.realWorker = Worker; window.Worker = class { postMessage() {} terminate() { window.workerTerminated = true; } }; });
  await page.locator('#export').click(); await cancel(page, 'worker never responds');
  assert.equal(await page.evaluate(() => window.workerTerminated), true);
  await page.evaluate(() => window.Worker = window.realWorker);
  await page.locator('#export').click(); await completed(page);
  const dl = page.waitForEvent('download'); await page.locator('#download').click(); await (await dl).saveAs('test-results/recovered.mp4');
  await page.close();

  page = await ready();
  await page.evaluate(() => window.showSaveFilePicker = () => new Promise(() => {}));
  await page.locator('#storage').selectOption('disk'); await page.locator('#export').click(); await cancel(page, 'file picker never resolves');
  await page.locator('#storage').selectOption('temp'); await page.locator('#export').click(); await completed(page); await page.close();

  page = await ready();
  await page.route('**/export-worker-*.js', async route => {
    const response = await route.fetch(); await route.fulfill({response, body: 'FileSystemFileHandle.prototype.createWritable=()=>new Promise(()=>{});\n'+await response.text()});
  });
  await page.locator('#export').click(); await page.waitForTimeout(1000); await cancel(page, 'disk opening stalls inside worker');
  await page.unroute('**/export-worker-*.js'); await page.locator('#export').click(); await completed(page); await page.close();

  page = await ready(() => {
    Object.defineProperty(navigator.serviceWorker, 'ready', {get: () => new Promise(() => {})});
    navigator.serviceWorker.register = () => new Promise(() => {});
  });
  await page.locator('#export').click(); await completed(page);
  assert.match(await page.locator('#download').getAttribute('href'), /^blob:/);
  const blobDl = page.waitForEvent('download'); await page.locator('#download').click(); await (await blobDl).saveAs('test-results/no-service-worker.mp4');
  console.log('PASS: download works with unavailable service worker'); await page.close();

  page = await ready();
  await page.route('**/export-worker-*.js', async route => {
    const response = await route.fetch(); await route.fulfill({response, body: 'FileSystemFileHandle.prototype.createWritable=undefined;\n'+await response.text()});
  });
  await page.locator('#export').click(); await completed(page);
  const syncDl = page.waitForEvent('download'); await page.locator('#download').click(); await (await syncDl).saveAs('test-results/sync-worker.mp4');
  console.log('PASS: synchronous OPFS inside export worker'); await page.close();

  page = await ready(() => { window.VideoEncoder = undefined; FileSystemFileHandle.prototype.createWritable = () => new Promise(() => {}); });
  await page.locator('#export').click(); await page.waitForTimeout(200); await cancel(page, 'compatibility disk opening stalls'); await page.close();

  page = await ready();
  await page.evaluate(() => { window.realWorker = Worker; window.Worker = class { postMessage() {} terminate() {} }; });
  await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('export-title').textContent === 'Chưa xuất được video', null, {timeout:40000});
  assert.equal(await page.evaluate(() => document.body.classList.contains('exporting')), false);
  assert.equal(await page.locator('#result-actions').isVisible(), false);
  assert.match(await page.locator('#export-detail').textContent(), /không phản hồi/);
  await page.locator('#cancel-export').click(); await page.evaluate(() => window.Worker = window.realWorker);
  await page.locator('#export').click(); await completed(page); console.log('PASS: unresponsive worker times out, no false success, retry works'); await page.close();

  page = await ready();
  await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('preserve-existing.mp4', {create:true});
    const writer = await handle.createWritable(); await writer.write('existing-file-must-survive'); await writer.close();
    window.showSaveFilePicker = async () => handle;
  });
  await page.route('**/export-worker-*.js', async route => {
    const response = await route.fetch(); await route.fulfill({response, body: 'const originalOpen=FileSystemFileHandle.prototype.createWritable;FileSystemFileHandle.prototype.createWritable=async function(){const w=await originalOpen.call(this);return{write:()=>new Promise(()=>{}),close:()=>w.close(),abort:()=>w.abort()};};\n'+await response.text()});
  });
  await page.locator('#storage').selectOption('disk'); await page.locator('#export').click(); await page.waitForTimeout(1500); await cancel(page, 'writing over existing chosen file');
  assert.equal(await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('preserve-existing.mp4')).getFile()).text()), 'existing-file-must-survive');
  console.log('PASS: canceled native output preserves existing file'); await page.close();

  page = await ready(null, 'test-results/long.mp4');
  await page.locator('#quality').selectOption('1080'); await page.locator('#export').click();
  await page.waitForFunction(() => document.getElementById('progress').value > .02, null, {timeout:60000});
  await cancel(page, 'active 12-second Full HD encoding');
  await page.locator('#quality').selectOption('720'); await page.locator('#export').click(); await completed(page);
  const longDl = page.waitForEvent('download'); await page.locator('#download').click(); await (await longDl).saveAs('test-results/long-recovered.mp4'); await page.close();
  assert.deepEqual(errors, []);
  console.log('PASS: stalled worker/picker/disk cancellation; retry; actual downloaded MP4; SW unavailable; sync disk writer; active heavy export cancellation and 12-second retry.');
} finally { await browser.close(); }
