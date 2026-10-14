import { waitFor, checkActive } from './export-control.js';
export const OUTPUT_FOLDER = 'mockup-iphone-output';
let downloaderReady = null;
const io = (promise, signal) => waitFor(promise, { signal, timeout: 20000, message: 'Bộ nhớ của trình duyệt không phản hồi. Hãy thử xuất HD hoặc mở trang bằng Safari / Chrome.' });

async function workerWriter(name, signal) {
  const worker = new Worker(new URL('file-worker.js', import.meta.url), { name: 'mockup-disk-writer' });
  let nextId = 0, stopped = false;
  const pending = new Map();
  const stop = () => { if (stopped) return; stopped = true; worker.terminate(); for (const p of pending.values()) p.reject(new DOMException('Đã dừng ghi tệp.', 'AbortError')); pending.clear(); signal?.removeEventListener('abort', stop); };
  signal?.addEventListener('abort', stop, { once: true });
  worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; pending.delete(data.id); data.error ? p.reject(new Error(data.error)) : p.resolve(); };
  worker.onerror = error => { for (const p of pending.values()) p.reject(new Error(error.message || 'Không mở được bộ nhớ tạm.')); stop(); };
  async function send(type, data = {}, transfers = []) {
    checkActive(signal); if (stopped) throw new Error('Bộ ghi tệp đã dừng.');
    const id = ++nextId;
    try { await io(new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, type, ...data }, transfers); }), signal); }
    catch (error) { stop(); throw error; }
    finally { pending.delete(id); }
  }
  await send('open', { name });
  return {
    async write(chunk) { const buffer = chunk.data.slice().buffer; await send('write', { data: buffer, position: chunk.position }, [buffer]); },
    async close() { try { await send('close'); } finally { stop(); } },
    abort: async () => stop(),
  };
}
function syncWriter(handle) {
  let size = 0, closed = false;
  return {
    write(chunk) { let offset = 0; while (offset < chunk.data.length) { const n = handle.write(chunk.data.subarray(offset), { at: chunk.position + offset }); if (!n) throw new Error('Không ghi được tệp tạm.'); offset += n; } size = Math.max(size, chunk.position + chunk.data.length); },
    close() { if (!closed) { handle.truncate(size); handle.flush(); handle.close(); closed = true; } },
    abort() { if (!closed) { handle.close(); closed = true; } },
  };
}
async function outputSlot(handle, { name, dir, signal }) {
  let writer, closed = false;
  try {
    const opening = typeof handle.createWritable === 'function' ? handle.createWritable() : typeof document === 'undefined' ? handle.createSyncAccessHandle().then(syncWriter) : workerWriter(name, signal);
    // If cancellation wins while opening, close a writer that arrives late.
    Promise.resolve(opening).then(w => { if (signal?.aborted) Promise.resolve(w.abort()).catch(() => {}); }, () => {});
    writer = await io(opening, signal);
  } catch (error) { if (dir) removeTemporaryOutput(name); throw error; }
  return {
    name, handle,
    async write(chunk) { checkActive(signal); await io(writer.write(chunk), signal); },
    async commit() { checkActive(signal); if (!closed) { await io(writer.close(), signal); closed = true; } return io(handle.getFile(), signal); },
    async abort() { if (!closed) { closed = true; await waitFor(Promise.resolve().then(() => writer.abort()), { timeout: 2000 }).catch(() => {}); } if (dir) await waitFor(dir.removeEntry(name), { timeout: 2000 }).catch(() => {}); },
    async remove() { if (dir) await waitFor(dir.removeEntry(name), { timeout: 2000 }).catch(() => {}); },
  };
}
export async function removeTemporaryOutput(name) {
  try {
    const root = await io(navigator.storage.getDirectory());
    const dir = await io(root.getDirectoryHandle(OUTPUT_FOLDER));
    // Worker termination releases Safari's sync-access lock asynchronously.
    for (const delay of [0, 250, 1000, 3000]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      try { await io(dir.removeEntry(name)); return; }
      catch (error) { if (error.name === 'NotFoundError') return; }
    }
  } catch {}
}

export async function openTemporaryOutput(extension = 'mp4', { signal, onName } = {}) {
  if (!navigator.storage?.getDirectory) throw new Error('Trình duyệt chưa hỗ trợ tệp tạm. Hãy mở trang bằng Safari mới hoặc Chrome máy tính.');
  const root = await io(navigator.storage.getDirectory(), signal);
  const dir = await io(root.getDirectoryHandle(OUTPUT_FOLDER, { create: true }), signal);
  const name = `export-${crypto.randomUUID()}.${extension}`;
  onName?.(name);
  const handle = await io(dir.getFileHandle(name, { create: true }), signal);
  return outputSlot(handle, { name, dir, signal });
}
export function openChosenOutput(handle, { signal } = {}) { return outputSlot(handle, { name: handle.name, signal }); }
export async function copyFileInto(file, sink, { signal } = {}) {
  for (let start = 0; start < file.size; start += 1024 * 1024) {
    checkActive(signal);
    const data = new Uint8Array(await io(file.slice(start, start + 1024 * 1024).arrayBuffer(), signal));
    await sink.write({ type: 'write', data, position: start });
  }
}
export function prepareDownloader() {
  downloaderReady ||= (async () => {
    if (!('serviceWorker' in navigator)) return false;
    try {
      await waitFor(navigator.serviceWorker.register(new URL('download-worker.js', document.baseURI), { scope: './', updateViaCache: 'none' }), { timeout: 4000 });
      await waitFor(navigator.serviceWorker.ready, { timeout: 4000 });
      if (!navigator.serviceWorker.controller) await waitFor(new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })), { timeout: 2000 }).catch(() => {});
      return !!navigator.serviceWorker.controller;
    } catch { return false; }
  })();
  return downloaderReady;
}
export async function fileDownloadUrl(slot, filename, mime) {
  if (!(await prepareDownloader())) return null;
  const url = new URL(`local-video/${slot.name}`, document.baseURI);
  url.searchParams.set('name', filename); url.searchParams.set('mime', mime);
  return url.href;
}
