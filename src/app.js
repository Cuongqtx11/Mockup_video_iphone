import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, StreamTarget, Mp4OutputFormat, WebMOutputFormat, Conversion, Quality, getFirstEncodableVideoCodec, canEncodeAudio } from 'mediabunny';
import MODELS from './frames.json';
import { createRenderer } from './render.js';

const $ = (id) => document.getElementById(id);
const video = $('source-video');
const preview = $('preview');
const ctx = preview.getContext('2d', { alpha: false });
let FINISHES = MODELS[0].variants;
const BACKGROUNDS = [
  { name: 'Lavender', colors: ['#f2ecfa', '#d6c8e9'] },
  { name: 'Apricot', colors: ['#fff0de', '#e7b6a4'] },
  { name: 'Ocean', colors: ['#e2eff6', '#9dbcca'] },
  { name: 'Midnight', colors: ['#3c3b50', '#171821'] },
  { name: 'Sage', colors: ['#eef1e9', '#b6c9b6'] },
  { name: 'Paper', colors: ['#faf9f7', '#eae8e4'] },
];
const defaults = { model: 0, finish: 0, background: 0, color: null, ratio: '9:16', scale: 78, zoom: 100, fit: 'cover', shadow: true };
let state = { ...defaults };
let file = null, fileUrl = null, backgroundImage = null, backgroundUrl = null, exportBlob = null, resultUrl = null;
let busy = false, cancelRequested = false, activeConversion = null, recorder = null, toastTimer, renderCache = null;
let frameAssets = null, loadingFrame = true, frameLoadToken = 0, temporaryOutputName = null;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let audioContext = null, audioSource = null, monitorGain = null, previewMuted = true;
const deviceMemory = Number(navigator.deviceMemory) || null;
// deviceMemory is an approximate total, never a measurement of free RAM.
const memoryBudget = deviceMemory ? Math.min(256, Math.max(64, deviceMemory * 32)) * 1024 ** 2 : 96 * 1024 ** 2;

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
  $('export-note').textContent = !file ? 'Thêm video để xuất mockup của bạn.' : estimatedSize() > memoryBudget && $('storage').value === 'ram' ? 'Video dài: chọn cách lưu Tự động để giảm RAM.' : 'Xuất xong → lưu vào Tệp hoặc Ảnh.';
}
const render = createRenderer(() => ({ state: { ...state, backgroundColors: BACKGROUNDS[state.background].colors }, variant: FINISHES[state.finish], assets: frameAssets, backgroundImage, backgroundUrl }));
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
function drawPreview(now = performance.now()) { if (busy) return; render(ctx, file && video.readyState >= 2 ? video : null, video.videoWidth, video.videoHeight, now); }
function animate(now) { if (!busy && (!file || !video.paused)) drawPreview(now); requestAnimationFrame(animate); }
function changeLayout() {
  const ratio = state.ratio === '9:16' ? 9 / 16 : state.ratio === '16:9' ? 16 / 9 : 1;
  preview.height = ratio < 1 ? 960 : 540; preview.width = Math.round(preview.height * ratio);
  preview.style.height = state.ratio === '16:9' ? 'auto' : ''; preview.style.width = state.ratio === '16:9' ? '100%' : '';
  renderCache = null; drawPreview(); updateExportInfo();
}

MODELS.forEach((m, i) => { const option = document.createElement('option'); option.value = i; option.textContent = m.name; $('model').append(option); });
BACKGROUNDS.forEach((bg, i) => { const button = document.createElement('button'); button.className = `background-tile${i === 0 ? ' active' : ''}`; button.style.background = `linear-gradient(135deg,${bg.colors.join(',')})`; button.title = bg.name; button.setAttribute('aria-label', `Nền ${bg.name}`); button.setAttribute('aria-pressed', i === 0); const label = document.createElement('span'); label.textContent = bg.name; button.append(label); button.onclick = () => { state.background = i; state.color = null; clearBackground(); syncBackgroundButtons(); drawPreview(); }; $('backgrounds').append(button); });
function syncBackgroundButtons() { [...$('backgrounds').children].forEach((button, i) => { const active = i === state.background && !state.color && !backgroundImage; button.classList.toggle('active', active); button.setAttribute('aria-pressed', active); }); }
function clearBackground() { if (backgroundUrl) URL.revokeObjectURL(backgroundUrl); backgroundImage = null; backgroundUrl = null; $('remove-bg').hidden = true; renderCache = null; }
$('model').onchange = () => { state.model = Number($('model').value); showFinishes(); };
for (const name of ['scale', 'zoom']) $(name).oninput = () => { state[name] = Number($(name).value); $(`${name}-value`).textContent = `${state[name]}%`; drawPreview(); };
$('fit').onchange = () => { state.fit = $('fit').value; drawPreview(); };
$('shadow').onchange = () => { state.shadow = $('shadow').checked; drawPreview(); };
for (const name of ['quality', 'fps', 'storage', 'audio']) $(name).onchange = updateExportInfo;
for (const button of $('ratios').children) button.onclick = () => { state.ratio = button.dataset.ratio; for (const b of $('ratios').children) { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', active); } changeLayout(); };
$('bg-color').oninput = () => { state.color = $('bg-color').value; clearBackground(); syncBackgroundButtons(); drawPreview(); };
$('bg-image').onchange = async () => {
  const imageFile = $('bg-image').files[0]; if (!imageFile || busy) return;
  const url = URL.createObjectURL(imageFile); const image = new Image(); image.src = url;
  try { await image.decode(); clearBackground(); backgroundImage = image; backgroundUrl = url; $('remove-bg').hidden = false; syncBackgroundButtons(); drawPreview(); } catch { URL.revokeObjectURL(url); toast('Không đọc được ảnh nền. Hãy thử PNG hoặc JPG.'); } finally { $('bg-image').value = ''; }
};
$('remove-bg').onclick = () => { clearBackground(); syncBackgroundButtons(); drawPreview(); };

let loadingToken = 0;
async function loadFile(selected) {
  if (!selected || busy) return;
  if (selected.type && !selected.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(selected.name)) { toast('Hãy chọn một tệp video.'); return; }
  const token = ++loadingToken; video.pause(); file = null; $('export').disabled = true; $('play').disabled = true; $('seek').disabled = true;
  if (fileUrl) URL.revokeObjectURL(fileUrl);
  fileUrl = URL.createObjectURL(selected); video.src = fileUrl; video.load();
  try {
    await new Promise((resolve, reject) => { const clean = () => { video.removeEventListener('loadeddata', ready); video.removeEventListener('error', failed); clearTimeout(timeout); }; const ready = () => { clean(); resolve(); }; const failed = () => { clean(); reject(new Error('Không đọc được video')); }; const timeout = setTimeout(failed, 20000); video.addEventListener('loadeddata', ready); video.addEventListener('error', failed); });
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
  if (busy) return; state = { ...defaults }; clearBackground(); $('model').value = 0; $('scale').value = 78; $('zoom').value = 100; $('fit').value = 'cover'; $('shadow').checked = true; $('audio').checked = true; $('scale-value').textContent = '78%'; $('zoom-value').textContent = '100%'; $('quality').value = 'auto'; $('fps').value = '30'; $('storage').value = 'auto'; showFinishes(); $('ratios').children[0].click(); syncBackgroundButtons(); changeLayout(); toast('Đã đặt lại bố cục và nền.');
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
function assertActive() { if (cancelRequested) throw new Error('CANCELED'); }
let aacReady = null;
function ensureAac() {
  aacReady ||= (async () => { if (!(await canEncodeAudio('aac'))) { const { registerAacEncoder } = await import('@mediabunny/aac-encoder'); registerAacEncoder(); } })();
  return aacReady;
}

async function exportFast(canvas, target) {
  const [width, height] = [canvas.width, canvas.height];
  const mp4Codec = await getFirstEncodableVideoCodec(['avc'], { width, height, bitrate: bitrate() });
  let codec = mp4Codec, format = new Mp4OutputFormat({ fastStart: target instanceof StreamTarget ? false : 'in-memory' });
  if (!codec) { codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height, bitrate: bitrate() }); format = new WebMOutputFormat(); }
  if (!codec) return null;
  if ($('storage').value === 'disk' && !mp4Codec) throw new Error('Máy này xuất WebM. Hãy chọn lưu trong RAM để tải đúng định dạng.');
  if (mp4Codec && $('audio').checked) await ensureAac();
  assertActive();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ target, format });
  let conversion = null;
  try {
    const c = canvas.getContext('2d', { alpha: false });
    conversion = await Conversion.init({ input, output, tracks: 'primary', video: { codec, quality: new Quality({ bitrate: bitrate() }), frameRate: Number($('fps').value), processedWidth: width, processedHeight: height, allowTransformationMetadata: false, process: (sample) => { assertActive(); render(c, sample, sample.displayWidth, sample.displayHeight); return canvas; } }, audio: { discard: !$('audio').checked, codec: mp4Codec ? 'aac' : 'opus' }, tags: { title: `${MODELS[state.model].name} mockup` } });
    const discarded = conversion.discardedTracks.filter((t) => t.reason !== 'discarded_by_user');
    if (!conversion.isValid || discarded.length) { await conversion.cancel(); return null; }
    activeConversion = conversion;
    const start = performance.now();
    $('export-detail').textContent = `Đang xuất ${format instanceof Mp4OutputFormat ? 'MP4' : 'WebM'} trên máy. Âm thanh ${$('audio').checked ? 'được giữ lại nếu video có âm thanh' : 'được tắt'}.`;
    conversion.onProgress = (p) => { const elapsed = (performance.now() - start) / 1000; const remaining = p > .03 ? Math.max(0, elapsed * (1 / p - 1)) : null; setProgress(p * .99, remaining === null ? 'Đang ghép khung…' : `Còn khoảng ${time(remaining)}`); };
    target.on('write', ({ end }) => { if (target instanceof BufferTarget && end > memoryBudget) { cancelRequested = true; conversion.cancel().catch(() => {}); toast('Đã dừng vì tệp xuất vượt mức RAM dự kiến. Giảm chất lượng hoặc ghi thẳng vào tệp.'); } });
    await conversion.execute(); assertActive();
    return { mime: format.mimeType, extension: mp4Codec ? 'mp4' : 'webm' };
  } catch (error) { if (conversion && conversion.state !== 'done') await conversion.cancel().catch(() => {}); else if (output.state !== 'finalized') await output.cancel().catch(() => {}); throw error; }
  finally { activeConversion = null; input.dispose(); }
}

async function normalizeRecording(blob) {
  // MediaRecorder can label H.264 + Opus as MP4. Copy the video and convert
  // audio to AAC so the result can be imported by iPhone Photos.
  if (!blob.type.includes('mp4') || !$('audio').checked) return blob;
  await ensureAac(); assertActive();
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const output = new Output({ target: new BufferTarget(), format: new Mp4OutputFormat() });
  let conversion = null;
  try {
    conversion = await Conversion.init({ input, output, tracks: 'primary', video: { codec: 'avc' }, audio: { codec: 'aac' } });
    if (!conversion.isValid || conversion.discardedTracks.length) { await conversion.cancel(); return blob; }
    activeConversion = conversion; setProgress(.99, 'Chuẩn hóa âm thanh để lưu vào Ảnh…');
    await conversion.execute(); assertActive(); return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (error) { if (conversion) await conversion.cancel().catch(() => {}); throw error; }
  finally { activeConversion = null; input.dispose(); }
}

async function exportRealtime(canvas) {
  if (!window.MediaRecorder || !canvas.captureStream) throw new Error('Trình duyệt chưa hỗ trợ xuất video. Hãy mở bằng Safari hoặc Chrome phiên bản mới.');
  if ($('storage').value === 'disk') throw new Error('Trình duyệt này chỉ hỗ trợ ghi theo thời gian thực vào RAM. Hãy chọn lưu trong RAM.');
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Trình duyệt chưa có bộ mã hóa video phù hợp.');
  const chunks = [], stream = canvas.captureStream(Number($('fps').value));
  let destination = null, raf = null, total = 0;
  const oldTime = video.currentTime;
  try {
    if ($('audio').checked) { await setupAudio(); destination = audioContext.createMediaStreamDestination(); audioSource.connect(destination); stream.addTrack(destination.stream.getAudioTracks()[0]); monitorGain.gain.value = 0; }
    await new Promise((resolve, reject) => { if (video.currentTime === 0) return resolve(); const timeout = setTimeout(() => reject(new Error('Không tua được video để xuất.')), 10000); video.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true }); video.currentTime = 0; });
    assertActive();
    const c = canvas.getContext('2d', { alpha: false }); render(c, video, video.videoWidth, video.videoHeight);
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate(), audioBitsPerSecond: 192000 });
    const done = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = () => reject(new Error('Không ghi được video.')); recorder.ondataavailable = (e) => { if (e.data.size) { total += e.data.size; if (total > memoryBudget) { cancelRequested = true; toast('Tệp xuất vượt mức RAM dự kiến. Hãy giảm chất lượng hoặc thời lượng.'); } else chunks.push(e.data); } }; });
    $('export-detail').textContent = 'Máy này hỗ trợ ghi theo thời gian thực. Thời gian xuất gần bằng thời lượng video.';
    function frame() {
      if (cancelRequested || video.ended) { video.pause(); if (recorder.state !== 'inactive') recorder.stop(); return; }
      render(c, video, video.videoWidth, video.videoHeight); setProgress(video.currentTime / video.duration * .99, `Đang ghi ${time(video.currentTime)} / ${time(video.duration)}`); raf = requestAnimationFrame(frame);
    }
    recorder.start(500); await video.play(); frame(); await done; assertActive();
    const blob = await normalizeRecording(new Blob(chunks, { type: recorder.mimeType || mime })); return { blob, extension: blob.type.includes('mp4') ? 'mp4' : 'webm' };
  } finally {
    if (raf) cancelAnimationFrame(raf); video.pause(); if (recorder?.state !== 'inactive') recorder?.stop(); stream.getTracks().forEach((t) => t.stop()); if (destination) audioSource.disconnect(destination); if (monitorGain) monitorGain.gain.value = previewMuted ? 0 : 1; video.currentTime = oldTime; recorder = null;
  }
}

let resultFilename = '';
$('export').onclick = async () => {
  if (!file || busy || loadingFrame || !frameAssets) return;
  if ($('storage').value === 'ram' && estimatedSize() > memoryBudget) { toast(`Bản xuất dự kiến ${bytes(estimatedSize())}, vượt mức RAM thận trọng ${bytes(memoryBudget)}. Hãy chọn 720p / 30 fps hoặc ghi thẳng vào tệp.`); return; }
  if ($('storage').value === 'disk' && !window.showSaveFilePicker) { toast('Ghi thẳng vào tệp chưa được hỗ trợ trên trình duyệt này. Hãy chọn lưu trong RAM.'); return; }
  // Invoke picker in the user gesture, before any asynchronous codec checks.
  const picker = $('storage').value === 'disk' ? window.showSaveFilePicker({ suggestedName: 'iphone-mockup.mp4', types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }] }) : null;
  if ($('audio').checked) setupAudio().catch(() => {});
  busy = true; cancelRequested = false; document.body.classList.add('exporting'); video.pause();
  $('export-title').textContent = 'Đang tạo mockup…'; $('export-detail').textContent = 'Video được xử lý ngay trên thiết bị của bạn.'; $('result-actions').hidden = true; $('cancel-export').textContent = 'Hủy xuất'; $('cancel-export').disabled = false; $('export-dialog').showModal(); setProgress(0, 'Chuẩn bị bộ mã hóa…');
  let writable = null, wakeLock = null, temporaryHandle = null, temporaryDirectory = null, nextTempName = null;
  try {
    const handle = picker ? await picker : null; assertActive();
    if (handle) writable = await handle.createWritable();
    else if ($('storage').value === 'auto' && estimatedSize() > memoryBudget) {
      if (!navigator.storage?.getDirectory) throw new Error('Video xuất lớn hơn mức RAM dự kiến. Hãy giảm độ phân giải, rút ngắn video hoặc dùng Chrome trên máy tính để ghi thẳng vào tệp.');
      try {
        temporaryDirectory = await (await navigator.storage.getDirectory()).getDirectoryHandle('mockup-iphone-output', { create: true });
        nextTempName = `export-${crypto.randomUUID()}.mp4`;
        temporaryHandle = await temporaryDirectory.getFileHandle(nextTempName, { create: true });
        writable = await temporaryHandle.createWritable();
        setProgress(0, 'Đang tạo tệp tạm để giảm RAM…');
      } catch { throw new Error('Không tạo được bộ nhớ tạm. Hãy giảm chất lượng hoặc chọn ghi thẳng vào tệp trên máy tính.'); }
    }
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
    const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = dimensions();
    // Keep the actual file writable under our control: StreamTarget closes its
    // stream on cancellation too. Only commit the file after a successful export;
    // aborting the original writable preserves any existing file on cancellation.
    const diskBridge = writable ? new WritableStream({ write: (chunk) => writable.write(chunk) }) : null;
    const target = diskBridge ? new StreamTarget(diskBridge, { chunked: true, chunkSize: 1024 * 1024 }) : new BufferTarget();
    let result = null;
    if (window.VideoEncoder && window.VideoDecoder) result = await exportFast(canvas, target);
    if (!result) { assertActive(); if (writable) throw new Error('Định dạng video này cần chế độ ghi vào RAM. Hãy chọn RAM hoặc đổi video sang MP4 H.264.'); result = await exportRealtime(canvas); }
    assertActive(); setProgress(1, 'Hoàn tất');
    if (writable) { await writable.close(); writable = null; }
    if (handle) { $('export-title').textContent = 'Đã lưu video!'; $('export-detail').textContent = 'Video mockup đã được ghi trực tiếp vào tệp bạn chọn.'; }
    else {
      const nextBlob = temporaryHandle ? new Blob([await temporaryHandle.getFile()], { type: result.mime }) : result.blob || new Blob([target.buffer], { type: result.mime });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      $('result-preview').pause(); exportBlob = nextBlob;
      if (temporaryOutputName) { try { const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('mockup-iphone-output'); await dir.removeEntry(temporaryOutputName); } catch {} }
      temporaryOutputName = nextTempName; nextTempName = null;
      resultUrl = URL.createObjectURL(exportBlob); resultFilename = `${file.name.replace(/\.[^.]+$/, '')}-${MODELS[state.model].name.replaceAll(' ', '-')}-mockup.${result.extension}`;
      $('download').href = resultUrl; $('download').download = resultFilename; $('result-actions').hidden = false;
      $('share').hidden = !navigator.canShare?.({ files: [new File([exportBlob], resultFilename, { type: exportBlob.type })] });
      $('last-share').hidden = $('share').hidden; $('last-download').href = resultUrl; $('last-download').download = resultFilename; $('last-result').hidden = false; $('last-result-info').textContent = `${dimensions().join(' × ')} · ${bytes(exportBlob.size)} · ${result.extension.toUpperCase()}`;
      $('open-result').href = resultUrl; $('result-preview').src = resultUrl;
      $('save-help').textContent = exportBlob.type.includes('webm') ? 'Máy này xuất định dạng WebM. Bạn có thể lưu vào Tệp; để nhập vào Ảnh trên iPhone cần bản MP4 từ trình duyệt có bộ mã hóa H.264.' : isIOS ? 'Safari: “Lưu video vào Tệp” lưu ở Tệp › Tải về. Muốn lưu vào Ảnh, chọn “Lưu vào Ảnh / chia sẻ” rồi “Lưu video”. Nếu đang mở trong một ứng dụng, hãy mở trang bằng Safari.' : 'Bấm “Lưu video vào Tệp” để tải xuống. Nếu chưa thấy tệp, mở video ở tab mới rồi chọn lưu video.';
      $('export-title').textContent = 'Mockup của bạn đã sẵn sàng.'; $('export-detail').textContent = `${bytes(exportBlob.size)} · ${result.extension.toUpperCase()} · ${dimensions().join(' × ')}. Bấm tải về hoặc chia sẻ để lưu trên iPhone.`;
    }
    $('cancel-export').textContent = 'Đóng';
  } catch (error) {
    if (cancelRequested || error.name === 'AbortError' || error.name === 'ConversionCanceledError' || error.message === 'CANCELED') { $('export-dialog').close(); if (error.name !== 'AbortError') toast('Đã hủy xuất video.'); }
    else { console.error(error); $('export-title').textContent = 'Chưa xuất được video'; $('export-detail').textContent = error.message || 'Hãy thử 720p hoặc trình duyệt mới hơn.'; $('cancel-export').textContent = 'Đóng'; }
  } finally { if (writable) await writable.abort().catch(() => {}); if (nextTempName && temporaryDirectory) await temporaryDirectory.removeEntry(nextTempName).catch(() => {}); await wakeLock?.release().catch(() => {}); busy = false; document.body.classList.remove('exporting'); renderCache = null; drawPreview(); updateExportInfo(); }
};
async function cancelExport() { if (!busy) { $('result-preview').pause(); $('export-dialog').close(); return; } cancelRequested = true; $('cancel-export').disabled = true; $('cancel-export').textContent = 'Đang hủy…'; if (activeConversion) await activeConversion.cancel().catch(() => {}); if (recorder?.state !== 'inactive') recorder?.stop(); }
$('cancel-export').onclick = cancelExport;
$('export-dialog').addEventListener('cancel', (e) => { if (busy) { e.preventDefault(); cancelExport(); } });
$('share').onclick = async () => { try { await navigator.share({ files: [new File([exportBlob], resultFilename, { type: exportBlob.type })], title: 'Video mockup iPhone' }); } catch (e) { if (e.name !== 'AbortError') toast('Không chia sẻ được. Bạn có thể bấm Tải video về.'); } };
$('last-share').onclick = () => $('share').onclick();
for (const id of ['download', 'last-download']) $(id).addEventListener('click', () => { if (isIOS) toast('Video được lưu trong ứng dụng Tệp › Tải về. Dùng nút chia sẻ để lưu vào Ảnh.'); });
document.addEventListener('visibilitychange', () => { if (busy && document.hidden && recorder?.state === 'recording') { cancelRequested = true; recorder.stop(); toast('Đã dừng xuất vì trang bị ẩn. Giữ trang mở để ghi đủ khung hình.'); } });
if (!window.showSaveFilePicker) { $('storage').options[2].disabled = true; $('storage').options[2].textContent = 'Ghi thẳng vào tệp · dùng Chrome máy tính'; }
$('device-title').textContent = deviceMemory ? `RAM thiết bị khoảng ${deviceMemory} GB` : 'Chế độ bộ nhớ thận trọng';
$('device-detail').textContent = `${deviceMemory ? 'Không đo được RAM trống.' : 'Trình duyệt không cung cấp dung lượng RAM.'} Tệp được đọc từng phần; mức tệp xuất trong RAM khoảng ${bytes(memoryBudget)}.`;
showFinishes(); changeLayout(); requestAnimationFrame(animate);
