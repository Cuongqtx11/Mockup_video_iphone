import { Input, BlobSource, ALL_FORMATS, Output, StreamTarget, Mp4OutputFormat, Conversion, canEncodeAudio } from 'mediabunny';
import MODELS from './frames.json';
import { createRenderer } from './render.js';
import { BACKGROUNDS, paintBackground } from './backgrounds.js';
import { createTextEditor } from './text-editor.js';
import { openTemporaryOutput, openChosenOutput, copyFileInto, prepareDownloader, fileDownloadUrl, removeTemporaryOutput } from './file-storage.js';

import { waitFor, checkActive, abortError } from './export-control.js';

const $ = (id) => document.getElementById(id);
const video = $('source-video');
const preview = $('preview');
const ctx = preview.getContext('2d', { alpha: false });
let FINISHES = MODELS[0].variants;
const defaults = { model: 0, finish: 0, background: 0, color: null, ratio: '9:16', scale: 78, zoom: 100, fit: 'cover', shadow: true, deviceX: 50, deviceY: 50, texts: [] };
let state = structuredClone(defaults);
let file = null, fileUrl = null, backgroundImage = null, backgroundUrl = null, exportBlob = null, resultUrl = null;
let busy = false, recorder = null, toastTimer, renderCache = null;
let frameAssets = null, loadingFrame = true, frameLoadToken = 0, currentOutputSlot = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let audioContext = null, audioSource = null, monitorGain = null, previewMuted = true;
const deviceMemory = Number(navigator.deviceMemory) || null;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function time(seconds) { if (!Number.isFinite(seconds)) return '0:00'; return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
function bytes(n) { return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${(n / 1024 ** 2).toFixed(1)} MB`; }
function dimensions() {
  const quality = $('quality').value;
  const edge = quality === 'auto' ? (deviceMemory && deviceMemory >= 8 ? 1080 : 720) : Number(quality);
  const ratio = state.ratio === '9:16' ? 9 / 16 : state.ratio === '16:9' ? 16 / 9 : 1;
  return ratio >= 1 ? [Math.round(edge * ratio / 2) * 2, edge] : [edge, Math.round(edge / ratio / 2) * 2];
}
function bitrate() { const [w, h] = dimensions(); return Math.min(60e6, Math.round(w * h * Number($('fps').value) * .10)); }
function estimatedSize() { return (bitrate() + ($('audio').checked ? 192000 : 0)) / 8 * (video.duration || 0) * 1.12; }
function updateExportInfo() {
  const [w, h] = dimensions(); $('output-size').textContent = `${w} × ${h}`;
  $('output-estimate').textContent = file ? `≈ ${bytes(estimatedSize())}` : 'MP4 / WebM';
  $('export-note').textContent = !file ? 'Thêm video để xuất mockup của bạn.' : 'Ghi từng phần vào tệp · không gom cả video trong RAM.';
}
const render = createRenderer(() => ({ state: { ...state, backgroundPreset: BACKGROUNDS[state.background] }, variant: FINISHES[state.finish], assets: frameAssets, backgroundImage, backgroundUrl }));
async function loadFrame() {
  const token = ++frameLoadToken; loadingFrame = true; frameAssets = null;
  $('export').disabled = true;
  const variant = FINISHES[state.finish];
  const frame = new Image(), mask = new Image(); frame.src = variant.frame; mask.src = variant.mask;
  try {
    await Promise.all([frame.decode(), mask.decode()]);
    if (token !== frameLoadToken) return;
    frameAssets = { frame, mask }; loadingFrame = false; $('export').disabled = !file; drawPreview();
  } catch { if (token === frameLoadToken) { loadingFrame = false; toast('Không tải được khung máy. Hãy chọn lại dòng máy hoặc tải lại trang.'); } }
}
function showFinishes() {
  FINISHES = MODELS[state.model].variants; state.finish = 0;
  $('finishes').replaceChildren(); $('finish-label').textContent = FINISHES[0].name;
  FINISHES.forEach((finish, i) => {
    const button = document.createElement('button'); button.className = `swatch${i === 0 ? ' active' : ''}`;
    button.style.background = finish.color; button.title = finish.name; button.setAttribute('aria-label', finish.name); button.setAttribute('aria-pressed', i === 0);
    button.onclick = () => {
      if (busy) return; state.finish = i; $('finish-label').textContent = finish.name;
      for (const b of $('finishes').children) { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); }
      loadFrame();
    }; $('finishes').append(button);
  }); loadFrame();
}
function drawPreview(now = performance.now()) { if (busy) return; render(ctx, file && video.readyState >= 2 ? video : null, video.videoWidth, video.videoHeight, file ? video.currentTime : now / 1000); }
function animate(now) { if (!busy && (!file || !video.paused)) drawPreview(now); requestAnimationFrame(animate); }
function changeLayout() {
  const ratio = state.ratio === '9:16' ? 9 / 16 : state.ratio === '16:9' ? 16 / 9 : 1;
  preview.height = ratio < 1 ? 960 : 540; preview.width = Math.round(preview.height * ratio);
  preview.style.height = state.ratio === '16:9' ? 'auto' : ''; preview.style.width = state.ratio === '16:9' ? '100%' : '';
  renderCache = null; drawPreview(); updateExportInfo();
}

MODELS.forEach((m, i) => { const option = document.createElement('option'); option.value = i; option.textContent = m.name; $('model').append(option); });
BACKGROUNDS.forEach((bg, i) => { const button = document.createElement('button'); button.className = `background-tile${i === 0 ? ' active' : ''}`; const thumb = document.createElement('canvas'); thumb.width = 160; thumb.height = 100; paintBackground(thumb.getContext('2d'),160,100,bg); button.style.background = `url("${thumb.toDataURL('image/png')}") center / cover`; button.title = bg.name; button.setAttribute('aria-label', `Nền ${bg.name}`); button.setAttribute('aria-pressed', i === 0); const label = document.createElement('span'); label.textContent = bg.name; button.append(label); button.onclick = () => { state.background = i; state.color = null; clearBackground(); syncBackgroundButtons(); drawPreview(); }; $('backgrounds').append(button); });
function syncBackgroundButtons() { [...$('backgrounds').children].forEach((button, i) => { const active = i === state.background && !state.color && !backgroundImage; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }); }
function clearBackground() { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); backgroundImage = null; backgroundUrl = null; $('remove-bg').hidden = true; renderCache = null; }
$('model').onchange = () => { state.model = Number($('model').value); showFinishes(); };
for (const name of ['scale', 'zoom']) $(name).oninput = () => { state[name] = Number($(name).value); $(`${name}-value`).textContent = `${state[name]}%`; drawPreview(); };
for (const [id,key] of [['device-x','deviceX'],['device-y','deviceY']]) $(id).oninput = () => { state[key] = Number($(id).value); $(`${id}-value`).textContent = `${state[key]}%`; drawPreview(); };
$('fit').onchange = () => { state.fit = $('fit').value; drawPreview(); };
$('shadow').onchange = () => { state.shadow = $('shadow').checked; drawPreview(); };
for (const name of ['quality', 'fps', 'storage', 'audio']) $(name).onchange = updateExportInfo;
for (const button of $('ratios').children) button.onclick = () => { state.ratio = button.dataset.ratio; for (const b of $('ratios').children) { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); } changeLayout(); };
$('bg-color').oninput = () => { state.color = $('bg-color').value; clearBackground(); syncBackgroundButtons(); drawPreview(); };
$('bg-image').onchange = async () => {
  const imageFile = $('bg-image').files[0]; if (!imageFile || busy) return;
  const url = URL.createObjectURL(imageFile); const image = new Image(); image.src = url;
  try { await image.decode(); if(busy){URL.revokeObjectURL(url);toast('Hãy chọn lại ảnh nền sau khi xuất xong.');return;} clearBackground(); backgroundImage = image; backgroundUrl = url; $('remove-bg').hidden = false; syncBackgroundButtons(); drawPreview(); } catch { URL.revokeObjectURL(url); toast('Không đọc được ảnh nền. Hãy thử PNG hoặc JPG.'); } finally { $('bg-image').value = ''; }
};
$('remove-bg').onclick = () => { clearBackground(); syncBackgroundButtons(); drawPreview(); };
const { sync: syncTextControls, ensureFonts } = createTextEditor({ getState: () => state, isBusy: () => busy, canvas: preview, renderer: render, redraw: drawPreview });

let loadingToken = 0;
async function loadFile(selected) {
  if (!selected || busy) return;
  if (selected.type && !selected.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(selected.name)) { toast('Hãy chọn một tệp video.'); return; }
  const token = ++loadingToken; video.pause(); file = null; $('export').disabled = true; $('play').disabled = true; $('seek').disabled = true;
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = URL.createObjectURL(selected);
  try {
    await new Promise((resolve, reject) => {
      const clean = () => { video.removeEventListener('loadeddata', ready); video.removeEventListener('loadedmetadata', seekFirstFrame); video.removeEventListener('error', failed); clearTimeout(timeout); };
      const ready = () => { clean(); resolve(); };
      const failed = () => { clean(); reject(new Error('Không đọc được video')); };
      const seekFirstFrame = () => { if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(.001, video.duration / 2); };
      const timeout = setTimeout(failed, 20000);
      // Subscribe before load and request decoded data, not metadata alone.
      video.addEventListener('loadeddata', ready); video.addEventListener('loadedmetadata', seekFirstFrame); video.addEventListener('error', failed);
      video.preload = 'auto'; video.src = fileUrl; video.load();
    });
    if (token !== loadingToken) return;
    if (!Number.isFinite(video.duration) || !video.videoWidth) throw new Error('Video không có thời lượng hợp lệ');
    file = selected; $('dropzone').hidden = true; $('file-info').hidden = false; $('file-name').textContent = selected.name;
    $('file-details').textContent = `${video.videoWidth} × ${video.videoHeight} · ${time(video.duration)} · ${bytes(selected.size)}`;
    $('duration').textContent = time(video.duration); $('current-time').textContent = '0:00'; $('seek').value = 0; $('play').disabled = false; $('seek').disabled = false; $('export').disabled = loadingFrame || !frameAssets; $('demo-label').hidden = true;
    // A tiny seek makes Chromium/Safari present a decoded frame even when the
    // source video is hidden and has never played.
    video.currentTime = Math.min(.001, video.duration / 2);
    drawPreview(); updateExportInfo();
    if (selected.size > 1024 ** 3) toast('Tệp lớn được đọc theo từng phần. Bạn có thể chọn 720p để xuất nhẹ hơn.');
  } catch { if (token === loadingToken) { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(fileUrl); fileUrl = null; $('file-info').hidden = true; $('dropzone').hidden = false; $('demo-label').hidden = false; toast('Trình duyệt chưa đọc được video này. Hãy thử MP4 H.264 hoặc WebM.'); drawPreview(); } }
}
$('video-file').onchange = () => { const f = $('video-file').files[0]; $('video-file').value = ''; loadFile(f); };
$('replace').onclick = () => $('video-file').click();
$('dropzone').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('video-file').click(); } };
for (const event of ['dragenter', 'dragover']) $('dropzone').addEventListener(event, (e) => { e.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const event of ['dragleave', 'drop']) $('dropzone').addEventListener(event, (e) => { e.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
$('play').onclick = async () => { try { if (video.paused) { if (audioContext) await audioContext.resume(); await video.play(); } else video.pause(); } catch { toast('Không phát được video. Hãy chọn lại tệp.'); } };
video.onplay = () => { $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Tạm dừng video'); };
video.onpause = () => { $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Phát video'); };
video.ontimeupdate = () => { if (!busy) { $('current-time').textContent = time(video.currentTime); $('seek').value = video.currentTime / video.duration * 100 || 0; } };
video.onseeked = () => drawPreview();
$('seek').oninput = () => { if (file) video.currentTime = Number($('seek').value) / 100 * video.duration; };
$('mute').onclick = async () => { previewMuted = !previewMuted; video.muted = audioSource ? false : previewMuted; if (monitorGain) { await audioContext.resume(); monitorGain.gain.value = previewMuted ? 0 : 1; } $('mute').textContent = previewMuted ? '♬' : '♪'; $('mute').title = previewMuted ? 'Bật âm thanh xem trước' : 'Tắt âm thanh xem trước'; $('mute').setAttribute('aria-label', $('mute').title); };
$('reset').onclick = () => {
  if (busy) return; state = structuredClone(defaults); syncTextControls(); clearBackground(); $('device-x').value = $('device-y').value = 50; $('device-x-value').textContent = $('device-y-value').textContent = '50%'; $('model').value = 0; $('scale').value = 78; $('zoom').value = 100; $('fit').value = 'cover'; $('shadow').checked = true; $('audio').checked = true; $('scale-value').textContent = '78%'; $('zoom-value').textContent = '100%'; $('quality').value = 'auto'; $('fps').value = '30'; $('storage').value = 'auto'; showFinishes(); $('ratios').children[0].click(); syncBackgroundButtons(); changeLayout(); toast('Đã đặt lại bố cục và nền.');
};

function setupAudio() {
  if (!audioContext) {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Trình duyệt chưa hỗ trợ ghi âm thanh.');
    audioContext = new Audio(); audioSource = audioContext.createMediaElementSource(video); monitorGain = audioContext.createGain(); monitorGain.gain.value = previewMuted ? 0 : 1; audioSource.connect(monitorGain); monitorGain.connect(audioContext.destination); video.muted = false;
  }
  return audioContext.resume();
}
function setProgress(progress, label) { $('progress').value = progress; $('progress-percent').textContent = `${Math.round(progress * 100)}%`; $('progress-label').textContent = label; }
let currentJob = null, resultFilename = '';
function unlock(job) {
  if (currentJob !== job) return;
  currentJob = null; busy = false; document.body.classList.remove('exporting');
  requestAnimationFrame(() => { if (!busy) drawPreview(); }); updateExportInfo();
}
function report(job, progress, label) { if (currentJob === job && !job.signal.aborted) setProgress(progress, label); }
function jobWait(job, promise, timeout = 30000, message) { return waitFor(promise, { signal: job.signal, timeout, message }); }
function disposeJob(job) {
  job.worker?.terminate(); job.worker = null;
  job.stopRecording?.(); job.stopRecording = null;
  if (job.slotName) removeTemporaryOutput(job.slotName);
  job.sink?.abort().catch(() => {});
  job.wakeLock?.release().catch(() => {});
}
async function runWorker(job, handle, source = file) {
  const [width, height] = dimensions();
  const worker = new Worker(new URL(EXPORT_WORKER_URL, document.baseURI), { type: 'module', name: 'mockup-video-export' });
  job.worker = worker;
  let watchdog, settled = false, previousProgress = 0, lastAdvance = performance.now();
  try {
    return await new Promise((resolve, reject) => {
      const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(watchdog); job.signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(result); };
      const aborted = () => finish(abortError());
      const arm = () => { clearTimeout(watchdog); watchdog = setTimeout(() => finish(new Error('Bộ xuất video không phản hồi. Hãy thử HD hoặc mở trang bằng Safari / Chrome.')), 30000); };
      job.signal.addEventListener('abort', aborted, { once: true });
      if (job.signal.aborted) return aborted();
      worker.onerror = error => { error.preventDefault(); finish(new Error(error.message || 'Không khởi động được bộ xuất video.')); };
      worker.onmessage = ({ data }) => {
        if (settled) return;
        arm();
        if (data.type === 'slot') job.slotName = data.name;
        if (data.type === 'progress') {
          if (data.progress > previousProgress) { previousProgress = data.progress; lastAdvance = performance.now(); }
          report(job, data.progress, data.label);
        }
        if (data.type === 'heartbeat' && performance.now() - lastAdvance > 90000) finish(new Error('Video không tiến triển trong 90 giây. Hãy thử chất lượng HD.'));
        if (data.type === 'result') { job.slotName = null; finish(null, data); }
        if (data.type === 'fallback') { if (job.slotName) removeTemporaryOutput(job.slotName); job.slotName = null; finish(null, null); }
        if (data.type === 'error') finish(new Error(data.message));
      };
      arm();
      worker.postMessage({ type: 'start', file: source, state: structuredClone({ ...state, backgroundPreset: BACKGROUNDS[state.background] }), variant: FINISHES[state.finish], base: document.baseURI, backgroundUrl, width, height, bitrate: bitrate(), fps: Number($('fps').value), audio: $('audio').checked, title: `${MODELS[state.model].name} mockup`, handle });
    });
  } finally { worker.terminate(); if (job.worker === worker) job.worker = null; }
}
let aacReady = null;
function ensureAac() {
  aacReady ||= (async () => { if (!(await canEncodeAudio('aac'))) { const { registerAacEncoder } = await import('@mediabunny/aac-encoder'); registerAacEncoder(); } })();
  return aacReady;
}
async function normalizeRecording(job, recorded) {
  if (!recorded.mime.includes('mp4') || !$('audio').checked) return recorded;
  const input = new Input({ source: new BlobSource(recorded.file), formats: ALL_FORMATS });
  let slot, conversion;
  try {
    const audioTrack = await jobWait(job, input.getPrimaryAudioTrack());
    if (!audioTrack || audioTrack.codec === 'aac') return recorded;
    await jobWait(job, ensureAac());
    slot = await openTemporaryOutput('mp4', { signal: job.signal }); job.sink = slot;
    const output = new Output({ target: new StreamTarget(new WritableStream({ write: chunk => slot.write(chunk) }), { chunked: true, chunkSize: 1024 * 1024 }), format: new Mp4OutputFormat({ fastStart: false }) });
    conversion = await jobWait(job, Conversion.init({ input, output, tracks: 'primary', video: { codec: 'avc' }, audio: { codec: 'aac' } }));
    if (!conversion.isValid || conversion.discardedTracks.length) throw new Error('Không chuẩn hóa được âm thanh MP4. Hãy thử tắt âm thanh khi xuất.');
    report(job, .98, 'Đang chuẩn hóa âm thanh MP4…');
    await jobWait(job, conversion.execute(), Math.max(30000, video.duration * 3000));
    const result = { file: await slot.commit(), slotName: slot.name, mime: 'video/mp4', extension: 'mp4' };
    recorded.slot.remove(); job.sink = null; return result;
  } catch (error) { conversion?.cancel().catch(() => {}); slot?.abort().catch(() => {}); throw error; }
  finally { input.dispose(); }
}
async function exportRealtime(job, handle) {
  const [width, height] = dimensions();
  if (Math.min(width, height) > 1080) throw new Error('Trình duyệt này chưa hỗ trợ xuất độ phân giải cao trong worker. Hãy chọn HD / Full HD hoặc dùng trình duyệt mới hơn.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  if (!window.MediaRecorder || !canvas.captureStream) throw new Error('Trình duyệt chưa hỗ trợ xuất video. Hãy mở bằng Safari mới hoặc Chrome.');
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Máy chưa có bộ mã hóa video phù hợp.');
  const extension = mime.includes('mp4') ? 'mp4' : 'webm';
  if (handle && extension !== 'mp4') throw new Error('Trình duyệt chỉ ghi được WebM. Hãy chọn tệp tạm để lưu đúng định dạng.');
  const slot = await openTemporaryOutput(extension, { signal: job.signal, onName: name => job.slotName = name }); job.sink = slot;
  const stream = canvas.captureStream(Number($('fps').value)), oldTime = video.currentTime;
  let destination, raf, recording, position = 0, queued = 0, writeError, writeQueue = Promise.resolve(), success = false, stopped = false;
  const stop = () => {
    if (stopped) return; stopped = true;
    if (raf) cancelAnimationFrame(raf); video.pause();
    if (recording && recording.state !== 'inactive') recording.stop();
    stream.getTracks().forEach(track => track.stop());
    if (destination) { audioSource.disconnect(destination); destination = null; }
    if (monitorGain) monitorGain.gain.value = previewMuted ? 0 : 1;
    recorder = null;
  };
  job.stopRecording = stop;
  try {
    await jobWait(job, ensureFonts());
    if ($('audio').checked) { await jobWait(job, setupAudio()); destination = audioContext.createMediaStreamDestination(); audioSource.connect(destination); stream.addTrack(destination.stream.getAudioTracks()[0]); monitorGain.gain.value = 0; }
    await jobWait(job, new Promise(resolve => { if (video.currentTime === 0) return resolve(); video.addEventListener('seeked', resolve, { once: true }); video.currentTime = 0; }), 10000, 'Không tua được video.');
    checkActive(job.signal); const c = canvas.getContext('2d', { alpha: false }); render(c, video, video.videoWidth, video.videoHeight, 0);
    recording = recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate(), audioBitsPerSecond: 192000 });
    const done = new Promise((resolve, reject) => {
      recording.onstop = resolve; recording.onerror = () => reject(new Error('Không ghi được video.'));
      recording.ondataavailable = event => {
        if (!event.data.size || job.signal.aborted) return;
        const chunk = event.data; queued += chunk.size;
        if (queued > 16 * 1024 * 1024) { writeError = new Error('Bộ nhớ ghi quá chậm. Hãy thử HD.'); stop(); return; }
        writeQueue = writeQueue.then(async () => { checkActive(job.signal); const data = new Uint8Array(await chunk.arrayBuffer()); await slot.write({ type: 'write', data, position }); position += data.length; queued -= data.length; }).catch(error => { writeError = error; stop(); });
      };
    });
    // Attach rejection before video.play(), so recorder errors never escape.
    done.catch(() => {});
    $('export-detail').textContent = 'Ghi theo thời gian thực vào tệp trên máy. Giữ trang mở.';
    function frame() {
      if (job.signal.aborted || video.ended || writeError) { stop(); return; }
      render(c, video, video.videoWidth, video.videoHeight, video.currentTime); report(job, video.currentTime / video.duration * .96, `Đang ghi ${time(video.currentTime)} / ${time(video.duration)}`); raf = requestAnimationFrame(frame);
    }
    recording.start(500); await jobWait(job, video.play(), 10000, 'Không phát được video để ghi. Hãy thử phát video trước khi xuất.'); frame();
    await jobWait(job, done, Math.max(30000, video.duration * 1500 + 15000), 'Bộ ghi video không kết thúc. Hãy thử lại.');
    await jobWait(job, writeQueue); if (writeError) throw writeError; checkActive(job.signal);
    const recordedFile = await slot.commit();
    let result = await normalizeRecording(job, { file: recordedFile, slot, slotName: slot.name, mime, extension });
    if (handle) {
      const sink = await openChosenOutput(handle, { signal: job.signal }); job.sink = sink;
      await copyFileInto(result.file, sink, { signal: job.signal }); result.file = await sink.commit(); removeTemporaryOutput(result.slotName); result.slotName = null;
    }
    job.sink = null; job.slotName = null; success = true; return result;
  } finally {
    stop(); job.stopRecording = null;
    // Do not wait for stalled IO to restore the UI. Abort-aware writes stop on their own.
    if (!success) slot.abort().catch(() => {});
    if (currentJob === job) video.currentTime = oldTime;
  }
}
async function validateResult(job, result) {
  if (!result.file || result.file.size < 128) throw new Error('Tệp video xuất ra trống.');
  const media = document.createElement('video'), url = URL.createObjectURL(result.file);
  try {
    await jobWait(job, new Promise((resolve, reject) => { media.preload = 'metadata'; media.onloadedmetadata = resolve; media.onerror = () => reject(new Error('Tệp xuất ra không đọc được. Hãy thử HD hoặc tắt âm thanh.')); media.src = url; }), 15000, 'Không kiểm tra được tệp video xuất ra.');
    const [w, h] = dimensions();
    if (media.videoWidth !== w || media.videoHeight !== h || !Number.isFinite(media.duration) || media.duration < video.duration * .9) throw new Error('Tệp xuất thiếu khung hình hoặc sai kích thước. Hãy thử xuất lại ở HD.');
  } finally { media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); }
}
function presentResult(job, result, handle) {
  checkActive(job.signal);
  resultFilename = `${file.name.replace(/\.[^.]+$/, '')}-${MODELS[state.model].name.replaceAll(' ', '-')}-mockup.${result.extension}`;
  const typedFile = new File([result.file], resultFilename, { type: result.mime }), nextUrl = URL.createObjectURL(typedFile);
  $('result-preview').pause(); if (resultUrl) URL.revokeObjectURL(resultUrl);
  const previous = currentOutputSlot;
  currentOutputSlot = result.slotName ? { name: result.slotName, remove: () => removeTemporaryOutput(result.slotName) } : null;
  if (previous) setTimeout(() => previous.remove(), 120000);
  resultUrl = nextUrl; exportBlob = typedFile;
  for (const id of ['download', 'last-download']) { $(id).href = nextUrl; $(id).download = resultFilename; }
  $('open-result').href = nextUrl; $('result-preview').src = nextUrl;
  // Download readiness cannot delay export completion. Safari uses the native
  // File-backed URL / share sheet; Chromium may upgrade to a streamed download.
  if (currentOutputSlot && !isIOS) {
    const slot = currentOutputSlot, filename = resultFilename;
    fileDownloadUrl(slot, filename, result.mime).then(url => {
      if (!url || resultUrl !== nextUrl) return;
      for (const id of ['download', 'last-download']) { $(id).href = url; $(id).removeAttribute('download'); }
      const inline = new URL(url); inline.searchParams.set('inline', '1'); $('open-result').href = inline.href;
    }).catch(() => {});
  }
  const canShare = !!navigator.canShare?.({ files: [typedFile] }); $('share').hidden = $('last-share').hidden = !canShare;
  $('result-actions').hidden = false; $('last-result').hidden = false;
  $('last-result-info').textContent = `${dimensions().join(' × ')} · ${bytes(typedFile.size)} · ${result.extension.toUpperCase()} · ${handle ? 'Đã lưu vào tệp đã chọn' : 'Tệp trên máy đã sẵn sàng'}`;
  $('save-help').textContent = handle ? 'Video đã được ghi vào tệp bạn chọn.' : isIOS ? 'Bấm “Lưu vào Ảnh / chia sẻ” và chọn Lưu video hoặc Lưu vào Tệp. Nút “Tải video về” lưu vào thư mục Tải về; trình duyệt trong ứng dụng có thể cần mở bằng Safari.' : 'Bấm “Tải video về” để lưu tệp đã xuất vào máy. Video không được upload lên server.';
  if (result.extension === 'webm') $('save-help').textContent += ' WebM lưu được vào Tệp; nhập vào Ảnh trên iPhone cần MP4.';
  $('export-title').textContent = handle ? 'Đã lưu video!' : 'Mockup của bạn đã sẵn sàng.';
  $('export-detail').textContent = `${bytes(typedFile.size)} · ${result.extension.toUpperCase()} · ${dimensions().join(' × ')}${handle ? ' · đã ghi vào tệp đã chọn.' : '. Chọn lưu hoặc chia sẻ để đưa vào Tệp / Ảnh.'}`;
  $('cancel-export').textContent = 'Đóng'; report(job, 1, 'Đã kiểm tra tệp video');
}
$('export').onclick = async () => {
  if (!file || busy || loadingFrame || !frameAssets) return;
  const mode = $('storage').value;
  if (mode === 'disk' && !window.showSaveFilePicker) { toast('Máy này chưa hỗ trợ chọn tệp trực tiếp. Chọn tệp tạm và lưu qua bảng chia sẻ.'); return; }
  const direct = mode === 'disk' || (mode === 'auto' && typeof window.showSaveFilePicker === 'function');
  let picker;
  try { if (direct) picker = window.showSaveFilePicker({ suggestedName: 'iphone-mockup.mp4', types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }], startIn: 'downloads' }); } catch { toast('Không mở được bộ chọn tệp. Hãy chọn tệp tạm.'); return; }
  if ($('audio').checked) setupAudio().catch(() => {});
  const controller = new AbortController(), job = { controller, signal: controller.signal }; currentJob = job;
  busy = true; document.body.classList.add('exporting'); video.pause();
  $('export-title').textContent = 'Đang tạo mockup…'; $('export-detail').textContent = 'Ghi từng phần vào tệp trên máy. Có thể hủy bất cứ lúc nào.';
  $('result-actions').hidden = true; $('cancel-export').textContent = 'Hủy xuất'; $('cancel-export').disabled = false; $('export-dialog').showModal(); report(job, 0, 'Đang chuẩn bị…');
  let result;
  try {
    const handle = picker ? await jobWait(job, picker, 120000, 'Bộ chọn tệp chưa phản hồi. Hãy thử lại.') : null;
    navigator.wakeLock?.request('screen').then(lock => { if (currentJob === job) job.wakeLock = lock; else lock.release().catch(() => {}); }).catch(() => {});
    if (window.Worker && window.OffscreenCanvas && window.VideoEncoder && window.VideoDecoder) result = await runWorker(job, handle);
    checkActive(job.signal);
    if (!result) result = await exportRealtime(job, handle);
    await validateResult(job, result); presentResult(job, result, handle);
  } catch (error) {
    if (result?.slotName) removeTemporaryOutput(result.slotName);
    if (currentJob !== job) return;
    if (error.name === 'AbortError') $('export-dialog').close();
    else { $('export-title').textContent = 'Chưa xuất được video'; $('export-detail').textContent = error.message || 'Hãy thử chất lượng HD.'; $('cancel-export').textContent = 'Đóng'; }
  } finally { disposeJob(job); unlock(job); }
};
function cancelExport() {
  if (!busy) { $('result-preview').pause(); $('export-dialog').close(); return; }
  const job = currentJob;
  // Release UI synchronously. Killing the worker also interrupts CPU-bound work.
  job.controller.abort(); $('export-dialog').close(); unlock(job); disposeJob(job);
  toast('Đã dừng xuất. Bạn có thể chỉnh sửa hoặc xuất lại ngay.');
}
$('cancel-export').onclick = cancelExport;
$('export-dialog').addEventListener('cancel', e => { if (busy) { e.preventDefault(); cancelExport(); } });
$('share').onclick = async () => { try { await navigator.share({ files: [exportBlob], title: 'Video mockup iPhone' }); } catch (error) { if (error.name !== 'AbortError') toast('Không chia sẻ được. Hãy bấm Tải video về hoặc mở trong Safari.'); } };
$('last-share').onclick = () => $('share').onclick();
for (const id of ['download', 'last-download']) $(id).addEventListener('click', () => { if (isIOS) toast('Video tải về nằm ở Tệp › Tải về. Để lưu vào Ảnh, dùng nút chia sẻ.'); });
document.addEventListener('visibilitychange', () => { if (busy && document.hidden && recorder?.state === 'recording') { cancelExport(); toast('Đã dừng ghi vì trang bị ẩn. Hãy giữ trang mở khi xuất bằng bộ ghi tương thích.'); } });

if (!window.showSaveFilePicker) { $('storage').options[1].disabled = true; $('storage').options[1].textContent = 'Ghi trực tiếp · dùng Chrome máy tính'; }
$('device-title').textContent = typeof window.showSaveFilePicker === 'function' ? 'Ghi trực tiếp vào tệp trên máy' : 'Ghi vào tệp tạm trên máy';
$('device-detail').textContent = typeof window.showSaveFilePicker === 'function' ? 'Chọn nơi lưu trước khi xuất. Dữ liệu được ghi từng phần, không giữ cả video trong RAM.' : 'Xuất vào tệp tạm, sau đó lưu bằng bảng chia sẻ hoặc tải xuống. RAM vẫn dùng cho xử lý từng khung hình.';
prepareDownloader();showFinishes(); changeLayout(); requestAnimationFrame(animate);
