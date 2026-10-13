// Older Safari provides OPFS synchronous access only inside a dedicated worker.
let handle = null;
let maxSize = 0;
self.onmessage = async ({ data: message }) => {
  try {
    if (message.type === 'open') {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('mockup-iphone-output', { create: true });
      const file = await dir.getFileHandle(message.name, { create: true });
      handle = await file.createSyncAccessHandle(); handle.truncate(0); maxSize = 0;
    } else if (message.type === 'write') {
      const bytes = new Uint8Array(message.data);
      let offset = 0;
      while (offset < bytes.length) {
        const written = handle.write(bytes.subarray(offset), { at: message.position + offset });
        if (!written) throw new Error('Không ghi được tệp tạm.');
        offset += written;
      }
      maxSize = Math.max(maxSize, message.position + bytes.length);
    } else if (message.type === 'close' || message.type === 'abort') {
      if (handle) { if (message.type === 'close') { handle.truncate(maxSize); handle.flush(); } handle.close(); handle = null; }
    }
    self.postMessage({ id: message.id, ok: true });
  } catch (error) { self.postMessage({ id: message.id, error: error.message }); }
};
