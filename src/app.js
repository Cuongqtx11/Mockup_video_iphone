import { Input, BlobSource, ALL_FORMATS, Output, StreamTarget, Mp4OutputFormat, WebMOutputFormat, Conversion, Quality, getFirstEncodableVideoCodec, canEncodeAudio } from 'mediabunny';
import MODELS from './frames.json';
import { createRenderer } from './render.js';
import { BACKGROUNDS, paintBackground } from './backgrounds.js';
import { createTextEditor } from './text-editor.js';
import { openTemporaryOutput, openChosenOutput, copyFileInto, prepareDownloader, fileDownloadUrl } from './file-storage.js';

const $ = (id) => document.getElementById(id);
const video = $('source-video');
const preview = $('preview');
const ctx = preview.getContext('2d', { alpha: false });
let FINISHES = MODELS[0].variants;
const defaults = { model: 0, finish: 0, background: 0, color: null, ratio: '9:16', scale: 78, zoom: 100, fit: 'cover', shadow: true, deviceX: 50, deviceY: 50, texts: [] };
let state = structuredClone(defaults);
let file = null, fileUrl = null, backgroundImage = null, backgroundUrl = null, exportBlob = null, resultUrl = null;
let busy = false, cancelRequested = false, activeConversion = null, recorder = null, toastTimer, renderCache = null;
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
  if (savingDirect && !mp4Codec) return null;
  if (mp4Codec && $('audio').checked) await ensureAac();
  assertActive();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ target, format });
  let conversion = null;
  try {
    const c = canvas.getContext('2d', { alpha: false });
    conversion = await Conversion.init({ input, output, tracks: 'primary', video: { codec, quality: new Quality({ bitrate: bitrate() }), frameRate: Number($('fps').value), processedWidth: width, processedHeight: height, allowTransformationMetadata: false, process: (sample) => { assertActive(); render(c, sample, sample.displayWidth, sample.displayHeight, sample.timestamp); return canvas; } }, audio: { discard: !$('audio').checked, codec: mp4Codec ? 'aac' : 'opus' }, tags: { title: `${MODELS[state.model].name} mockup` } });
    const discarded = conversion.discardedTracks.filter((t) => t.reason !== 'discarded_by_user');
    if (!conversion.isValid || discarded.length) { await conversion.cancel(); return null; }
    activeConversion = conversion;
    const start = performance.now();
    $('export-detail').textContent = `Đang xuất ${format instanceof Mp4OutputFormat ? 'MP4' : 'WebM'} trên máy. Âm thanh ${$('audio').checked ? 'được giữ lại nếu video có âm thanh' : 'được tắt'}.`;
    conversion.onProgress = (p) => { const elapsed = (performance.now() - start) / 1000; const remaining = p > .03 ? Math.max(0, elapsed * (1 / p - 1)) : null; setProgress(p * .99, remaining === null ? 'Đang ghép khung…' : `Còn khoảng ${time(remaining)}`); };
    await conversion.execute(); assertActive();
    return { mime: format.mimeType, extension: mp4Codec ? 'mp4' : 'webm' };
  } catch (error) { if (conversion && conversion.state !== 'done') await conversion.cancel().catch(() => {}); else if (output.state !== 'finalized') await output.cancel().catch(() => {}); throw error; }
  finally { activeConversion = null; input.dispose(); }
}

async function normalizeRecording(recorded) {
  if (!recorded.mime.includes('mp4') || !$('audio').checked) return recorded;
  await ensureAac(); assertActive();
  const input = new Input({ source: new BlobSource(recorded.file), formats: ALL_FORMATS });
  const slot = await openTemporaryOutput('mp4');
  const target = new StreamTarget(new WritableStream({ write: chunk => slot.write(chunk) }), { chunked: true, chunkSize: 1024 * 1024 });
  const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: false }) });
  let conversion = null;
  try {
    conversion = await Conversion.init({ input, output, tracks: 'primary', video: { codec: 'avc' }, audio: { codec: 'aac' } });
    if (!conversion.isValid || conversion.discardedTracks.length) { await conversion.cancel(); await slot.abort(); return { ...recorded, compatible: false }; }
    activeConversion = conversion; setProgress(.99, 'Chuẩn hóa MP4 vào tệp trên máy…');
    await conversion.execute(); assertActive();
    const result = { file: await slot.commit(), slot, mime: 'video/mp4', extension: 'mp4', compatible: true };
    await recorded.slot.remove(); return result;
  } catch (error) { if(conversion)await conversion.cancel().catch(()=>{}); await slot.abort(); throw error; }
  finally { activeConversion = null; input.dispose(); }
}

async function exportRealtime(canvas) {
  if (!window.MediaRecorder || !canvas.captureStream) throw new Error('Trình duyệt chưa hỗ trợ xuất video. Hãy dùng Safari mới hơn hoặc Chrome.');
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m));
  if(!mime)throw new Error('Máy chưa có bộ mã hóa video phù hợp.');
  const extension = mime.includes('mp4') ? 'mp4' : 'webm';
  const slot = await openTemporaryOutput(extension), stream = canvas.captureStream(Number($('fps').value));
  let destination = null, raf = null, position = 0, queued = 0, writeError = null, writeQueue = Promise.resolve(), success = false;
  const oldTime = video.currentTime;
  try {
    if($('audio').checked){await setupAudio();destination=audioContext.createMediaStreamDestination();audioSource.connect(destination);stream.addTrack(destination.stream.getAudioTracks()[0]);monitorGain.gain.value=0;}
    await new Promise((resolve,reject)=>{if(video.currentTime===0)return resolve();const timeout=setTimeout(()=>reject(new Error('Không tua được video.')),10000);video.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});video.currentTime=0;});
    assertActive();const c=canvas.getContext('2d',{alpha:false});render(c,video,video.videoWidth,video.videoHeight,video.currentTime);
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate(),audioBitsPerSecond:192000});
    const done = new Promise((resolve,reject)=>{
      recorder.onstop=resolve;recorder.onerror=()=>reject(new Error('Không ghi được video.'));
      recorder.ondataavailable=event=>{
        if(!event.data.size)return;
        const chunk=event.data;queued+=chunk.size;
        if(queued>16*1024*1024){writeError=new Error('Tệp trên máy ghi quá chậm. Hãy giảm chất lượng hoặc đóng các ứng dụng khác.');if(recorder.state!=='inactive')recorder.stop();return;}
        writeQueue=writeQueue.then(async()=>{if(writeError)return;const data=new Uint8Array(await chunk.arrayBuffer());await slot.write({type:'write',data,position});position+=data.length;queued-=data.length;}).catch(error=>{writeError=error;if(recorder?.state!=='inactive')recorder?.stop();});
      };
    });
    $('export-detail').textContent='Ghi theo thời gian thực, từng phần vào tệp trên máy. Giữ trang mở.';
    function frame(){
      if(cancelRequested||video.ended||writeError){video.pause();if(recorder.state!=='inactive')recorder.stop();return;}
      render(c,video,video.videoWidth,video.videoHeight,video.currentTime);setProgress(video.currentTime/video.duration*.98,`Đang ghi ${time(video.currentTime)} / ${time(video.duration)}`);raf=requestAnimationFrame(frame);
    }
    recorder.start(500);await video.play();frame();await done;await writeQueue;if(writeError)throw writeError;assertActive();
    const file = await slot.commit();
    const result = await normalizeRecording({ file, slot, mime, extension, compatible: !mime.includes('webm') });
    success=true;return result;
  } finally {
    if(raf)cancelAnimationFrame(raf);video.pause();if(recorder?.state!=='inactive')recorder?.stop();await writeQueue.catch(()=>{});stream.getTracks().forEach(track=>track.stop());if(destination)audioSource.disconnect(destination);if(monitorGain)monitorGain.gain.value=previewMuted?0:1;video.currentTime=oldTime;recorder=null;
    if(!success)await slot.abort();
  }
}

let resultFilename = '', savingDirect = false;
$('export').onclick = async () => {
  if(!file||busy||loadingFrame||!frameAssets)return;
  const mode=$('storage').value;
  if(mode==='disk'&&!window.showSaveFilePicker){toast('Máy này chưa hỗ trợ chọn tệp trực tiếp. Chọn tệp tạm trên máy và lưu qua bảng chia sẻ.');return;}
  savingDirect=mode==='disk'||(mode==='auto'&&typeof window.showSaveFilePicker==='function');
  let picker=null;
  try {if(savingDirect)picker=window.showSaveFilePicker({suggestedName:'iphone-mockup.mp4',types:[{description:'MP4 video',accept:{'video/mp4':['.mp4']}}],startIn:'downloads'});}catch{toast('Không mở được bộ chọn tệp. Hãy chọn tệp tạm hoặc mở trang trong Chrome máy tính.');return;}
  if($('audio').checked)setupAudio().catch(()=>{});
  busy=true;cancelRequested=false;document.body.classList.add('exporting');video.pause();
  $('export-title').textContent='Đang tạo mockup…';$('export-detail').textContent='Ghi từng phần vào tệp trên máy.';$('result-actions').hidden=true;$('cancel-export').textContent='Hủy xuất';$('cancel-export').disabled=false;$('export-dialog').showModal();setProgress(0,'Chuẩn bị tệp & font chữ…');
  let sink=null,scratch=null,wakeLock=null,success=false;
  try {
    const handle=picker?await picker:null;assertActive();await ensureFonts();assertActive();
    sink=handle?await openChosenOutput(handle):await openTemporaryOutput('mp4');
    try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
    const canvas=document.createElement('canvas');[canvas.width,canvas.height]=dimensions();
    const target=new StreamTarget(new WritableStream({write:chunk=>sink.write(chunk)}),{chunked:true,chunkSize:1024*1024});
    let result=null;
    if(window.VideoEncoder&&window.VideoDecoder)result=await exportFast(canvas,target);
    let finalFile,finalSlot;
    if(result){finalFile=await sink.commit();finalSlot=handle?null:sink;}
    else {
      assertActive();scratch=await exportRealtime(canvas);result=scratch;
      if(handle&&result.extension!=='mp4')throw new Error('Máy chỉ xuất được WebM. Hãy chọn tệp tạm trên máy để lưu đúng định dạng.');
      await copyFileInto(scratch.file,sink);assertActive();finalFile=await sink.commit();finalSlot=handle?null:sink;await scratch.slot.remove();scratch=null;
    }
    assertActive();setProgress(1,'Hoàn tất');
    resultFilename=`${file.name.replace(/\.[^.]+$/,'')}-${MODELS[state.model].name.replaceAll(' ','-')}-mockup.${result.extension}`;
    const typedFile=new File([finalFile],resultFilename,{type:result.mime});
    const nextUrl=URL.createObjectURL(typedFile);
    const streamUrl=finalSlot ? await fileDownloadUrl(finalSlot,resultFilename,result.mime) : null;
    $('result-preview').pause();if(resultUrl)URL.revokeObjectURL(resultUrl);
    const previous=currentOutputSlot;currentOutputSlot=finalSlot;
    // Keep an old file available briefly for any download that is still finishing.
    if(previous)setTimeout(()=>previous.remove(),120000);
    resultUrl=nextUrl;exportBlob=typedFile;
    const downloadUrl=streamUrl||resultUrl;
    $('download').href=$('last-download').href=downloadUrl;
    // Chromium can bypass service workers for <a download>. Ordinary navigation
    // lets Content-Disposition start the local streamed download instead.
    for(const id of ['download','last-download']){if(streamUrl)$(id).removeAttribute('download');else $(id).download=resultFilename;}
    $('result-preview').src=resultUrl;
    const openUrl=new URL(downloadUrl);if(streamUrl)openUrl.searchParams.set('inline','1');$('open-result').href=openUrl.href;
    $('result-actions').hidden=false;$('last-result').hidden=false;
    const canShare=!!navigator.canShare?.({files:[typedFile]});$('share').hidden=$('last-share').hidden=!canShare;
    $('last-result-info').textContent=`${dimensions().join(' × ')} · ${bytes(typedFile.size)} · ${result.extension.toUpperCase()} · ${handle?'Đã lưu vào tệp đã chọn':'Tệp trên máy đã sẵn sàng'}`;
    $('save-help').textContent=result.extension==='webm' ? 'Video WebM lưu được vào Tệp; để nhập vào Ảnh trên iPhone cần MP4.' : isIOS ? 'Video đã được ghi vào tệp tạm, không gom cả video trong RAM. Bấm “Lưu vào Ảnh / chia sẻ” rồi chọn Lưu video hoặc Lưu vào Tệp. Nếu tải xuống chưa được, mở trang bằng Safari và dùng bảng chia sẻ.' : handle ? 'Video đã được lưu vào tệp bạn chọn. Bạn có thể mở hoặc tải lại bản xuất ở đây.' : 'Tệp đã được ghi trên máy. Bấm lưu để tải từ tệp cục bộ; không upload video lên server.';
    $('export-title').textContent=handle?'Đã lưu video!':'Mockup của bạn đã sẵn sàng.';
    $('export-detail').textContent=`${bytes(typedFile.size)} · ${result.extension.toUpperCase()} · ${dimensions().join(' × ')}${handle?' · đã ghi vào tệp đã chọn.':'. Chọn lưu hoặc chia sẻ để đưa vào Tệp / Ảnh.'}`;
    $('cancel-export').textContent='Đóng';success=true;
  } catch(error){
    if(cancelRequested||error.name==='AbortError'||error.name==='ConversionCanceledError'||error.message==='CANCELED'){$('export-dialog').close();if(error.name!=='AbortError')toast('Đã hủy xuất. Tệp đang ghi đã được hủy.');}
    else{console.error(error);$('export-title').textContent='Chưa xuất được video';$('export-detail').textContent=error.message||'Hãy thử HD hoặc dùng trình duyệt mới hơn.';$('cancel-export').textContent='Đóng';}
  } finally{
    if(!success&&sink)await sink.abort();if(scratch)await scratch.slot.abort();await wakeLock?.release().catch(()=>{});busy=false;document.body.classList.remove('exporting');renderCache=null;drawPreview();updateExportInfo();
  }
};
async function cancelExport() { if (!busy) { $('result-preview').pause(); $('export-dialog').close(); return; } cancelRequested = true; $('cancel-export').disabled = true; $('cancel-export').textContent = 'Đang hủy…'; if (activeConversion) await activeConversion.cancel().catch(() => {}); if (recorder?.state !== 'inactive') recorder?.stop(); }
$('cancel-export').onclick = cancelExport;
$('export-dialog').addEventListener('cancel', (e) => { if (busy) { e.preventDefault(); cancelExport(); } });
$('share').onclick = async () => { try { await navigator.share({ files: [new File([exportBlob], resultFilename, { type: exportBlob.type })], title: 'Video mockup iPhone' }); } catch (e) { if (e.name !== 'AbortError') toast('Không chia sẻ được. Bạn có thể bấm Tải video về.'); } };
$('last-share').onclick = () => $('share').onclick();
for (const id of ['download', 'last-download']) $(id).addEventListener('click', () => { if (isIOS) toast('Tìm tệp ở Tệp › Tải về. Nếu chưa thấy, dùng nút Lưu vào Ảnh / chia sẻ.'); });
document.addEventListener('visibilitychange', () => { if (busy && document.hidden && recorder?.state === 'recording') { cancelRequested = true; recorder.stop(); toast('Đã dừng xuất vì trang bị ẩn. Giữ trang mở để ghi đủ khung hình.'); } });
if (!window.showSaveFilePicker) { $('storage').options[1].disabled = true; $('storage').options[1].textContent = 'Ghi trực tiếp · dùng Chrome máy tính'; }
$('device-title').textContent = typeof window.showSaveFilePicker === 'function' ? 'Ghi trực tiếp vào tệp trên máy' : 'Ghi vào tệp tạm trên máy';
$('device-detail').textContent = typeof window.showSaveFilePicker === 'function' ? 'Chọn nơi lưu trước khi xuất. Dữ liệu được ghi từng phần, không giữ cả video trong RAM.' : 'Xuất vào tệp tạm, sau đó lưu bằng bảng chia sẻ hoặc tải xuống. RAM vẫn dùng cho xử lý từng khung hình.';
prepareDownloader();showFinishes(); changeLayout(); requestAnimationFrame(animate);
