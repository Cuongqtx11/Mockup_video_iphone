export const OUTPUT_FOLDER = 'mockup-iphone-output';
let downloaderReady = null;

async function workerWriter(name) {
  const worker = new Worker(new URL('file-worker.js', document.baseURI), { name: 'mockup-disk-writer' });
  let nextId = 0;
  const pending = new Map();
  worker.onmessage = ({ data }) => { const promise = pending.get(data.id); if (!promise) return; pending.delete(data.id); data.error ? promise.reject(new Error(data.error)) : promise.resolve(); };
  worker.onerror = (error) => { for (const p of pending.values()) p.reject(new Error(error.message || 'Không mở được bộ nhớ tạm.')); pending.clear(); };
  function send(type, data = {}, transfers = []) { return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); worker.postMessage({ id, type, ...data }, transfers); }); }
  try { await send('open', { name }); } catch (error) { worker.terminate(); throw error; }
  return {
    async write(chunk) { const buffer = chunk.data.slice().buffer; await send('write', { data: buffer, position: chunk.position }, [buffer]); },
    async close() { try { await send('close'); } finally { worker.terminate(); } },
    async abort() { try { await send('abort'); } finally { worker.terminate(); } },
  };
}

export async function openTemporaryOutput(extension = 'mp4') {
  if (!navigator.storage?.getDirectory) throw new Error('Trình duyệt chưa hỗ trợ tệp tạm trên máy. Hãy dùng Safari mới hơn hoặc Chrome máy tính để ghi trực tiếp.');
  const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(OUTPUT_FOLDER, { create: true });
  const name = `export-${crypto.randomUUID()}.${extension}`;
  const handle = await dir.getFileHandle(name, { create: true });
  let writer;
  try {
    writer = typeof handle.createWritable === 'function' ? await handle.createWritable() : await workerWriter(name);
  } catch (error) { await dir.removeEntry(name).catch(() => {}); throw new Error(`Không mở được tệp tạm: ${error.message}`); }
  let closed = false;
  return {
    name, handle,
    write: (chunk) => writer.write(chunk),
    async commit() { if (!closed) { await writer.close(); closed = true; } return handle.getFile(); },
    async abort() { if (!closed) { await writer.abort().catch(() => {}); closed = true; } await dir.removeEntry(name).catch(() => {}); },
    async remove() { await dir.removeEntry(name).catch(() => {}); },
  };
}

export async function openChosenOutput(handle) {
  const writer = await handle.createWritable();
  let closed = false;
  return {
    name: handle.name, handle,
    write: (chunk) => writer.write(chunk),
    async commit() { if (!closed) { await writer.close(); closed = true; } return handle.getFile(); },
    async abort() { if (!closed) { await writer.abort().catch(() => {}); closed = true; } },
  };
}

export async function copyFileInto(file, sink) {
  let position = 0;
  // Fixed-size reads keep RAM bounded even if the file is many gigabytes.
  for (let start = 0; start < file.size; start += 1024 * 1024) {
    const data = new Uint8Array(await file.slice(start, start + 1024 * 1024).arrayBuffer());
    await sink.write({ type: 'write', data, position }); position += data.length;
  }
}

export function prepareDownloader() {
  downloaderReady ||= (async () => {
    if (!('serviceWorker' in navigator)) return false;
    try {
      await navigator.serviceWorker.register(new URL('download-worker.js', document.baseURI), { scope: './', updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((resolve) => { const timeout = setTimeout(resolve, 5000); navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true }); });
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
