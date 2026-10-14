import { Input, BlobSource, ALL_FORMATS, Output, StreamTarget, Mp4OutputFormat, WebMOutputFormat, Conversion, Quality, getFirstEncodableVideoCodec, canEncodeAudio } from 'mediabunny';
import { createRenderer } from './render.js';
import { openTemporaryOutput, openChosenOutput } from './file-storage.js';
import { waitFor } from './export-control.js';
const send = (type, detail = {}) => self.postMessage({ type, ...detail });
const phase = label => send('progress', { progress: 0, label });
async function bitmap(url) { const response = await fetch(url); if (!response.ok) throw new Error('Không tải được khung máy.'); return createImageBitmap(await response.blob()); }
async function loadFonts(texts, base) {
  const files = { BVPro: 'BeVietnamPro-ExtraBold.ttf', Playfair: 'PlayfairDisplay.ttf', Oswald: 'Oswald.ttf' };
  for (const family of new Set(texts.map(t => t.font))) {
    if (!files[family]) continue;
    const font = new FontFace(family, `url("${new URL(`assets/fonts/${files[family]}`, base)}")`, { weight: '100 900' });
    await font.load(); self.fonts.add(font);
  }
}
self.onmessage = async ({ data }) => {
  if (data.type !== 'start') return;
  let slot, input, output;
  const { file, state, variant, base, width, height, bitrate, fps, audio, handle } = data;
  try {
    if (!self.VideoEncoder || !self.VideoDecoder || !self.OffscreenCanvas) { send('fallback'); return; }
    phase('Kiểm tra bộ mã hóa…');
    const mp4Codec = await waitFor(getFirstEncodableVideoCodec(['avc'], { width, height, bitrate }), { timeout: 15000 });
    const codec = mp4Codec || (!handle && await waitFor(getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height, bitrate }), { timeout: 15000 }));
    if (!codec) { send('fallback'); return; }
    input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    // Native AAC when available, otherwise install the streaming AAC encoder.
    if (mp4Codec && audio && !(await canEncodeAudio('aac'))) { const { registerAacEncoder } = await import('@mediabunny/aac-encoder'); registerAacEncoder(); }
    phase('Đang tải khung máy và font chữ…');
    const [frame, mask, backgroundImage] = await waitFor(Promise.all([bitmap(new URL(variant.frame, base)), bitmap(new URL(variant.mask, base)), data.backgroundUrl ? bitmap(data.backgroundUrl) : null, loadFonts(state.texts, base)]), { timeout: 20000 });
    slot = handle ? await openChosenOutput(handle) : await openTemporaryOutput(mp4Codec ? 'mp4' : 'webm', { onName: name => send('slot', { name }) });
    const format = mp4Codec ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat();
    output = new Output({ target: new StreamTarget(new WritableStream({ write: chunk => slot.write(chunk) }), { chunked: true, chunkSize: 1024 * 1024 }), format });
    const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d', { alpha: false });
    const render = createRenderer(() => ({ state, variant, assets: { frame, mask }, backgroundImage, backgroundUrl: data.backgroundUrl }));
    phase('Đang chuẩn bị video…');
    const conversion = await waitFor(Conversion.init({ input, output, tracks: 'primary', video: { codec, quality: new Quality({ bitrate }), frameRate: fps, processedWidth: width, processedHeight: height, allowTransformationMetadata: false, process(sample) { render(ctx, sample, sample.displayWidth, sample.displayHeight, sample.timestamp); return canvas; } }, audio: { discard: !audio, codec: mp4Codec ? 'aac' : 'opus' }, tags: { title: data.title } }), { timeout: 25000 });
    if (!conversion.isValid || conversion.discardedTracks.some(t => t.reason !== 'discarded_by_user')) {
      await slot.abort(); slot = null; send('fallback'); return;
    }
    let last = 0;
    conversion.onProgress = progress => { const now = performance.now(); if (now - last > 150 || progress === 1) { last = now; send('progress', { progress: progress * .97, label: 'Đang ghép khung và mã hóa video…' }); } };
    const heartbeat = setInterval(() => send('heartbeat'), 1000);
    try { await conversion.execute(); } finally { clearInterval(heartbeat); }
    send('progress', { progress: .98, label: 'Đang đóng và kiểm tra tệp…' });
    const result = await slot.commit();
    if (result.size < 128) throw new Error('Tệp video xuất ra trống.');
    send('result', { file: result, slotName: handle ? null : slot.name, mime: format.mimeType, extension: mp4Codec ? 'mp4' : 'webm' });
  } catch (error) {
    // Posting the error comes first; cleanup must never hold the UI hostage.
    send('error', { message: error.name === 'QuotaExceededError' ? 'Không đủ dung lượng trống để ghi video. Hãy giải phóng bộ nhớ hoặc chọn HD.' : error.message || 'Không xuất được video.' });
    slot?.abort().catch(() => {});
  } finally { input?.dispose(); }
};
