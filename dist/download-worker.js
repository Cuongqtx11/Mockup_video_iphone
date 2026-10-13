// Serve only locally generated files. No video data is sent to GitHub or a server.
const localPrefix = new URL('local-video/', self.registration.scope).pathname;
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(localPrefix)) return;
  event.respondWith(serve(event.request, url));
});
async function serve(request, url) {
  const name = url.pathname.slice(localPrefix.length);
  if (!/^export-[a-f0-9-]+\.(mp4|webm)$/.test(name)) return new Response('Không tìm thấy video.', { status: 404 });
  try {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('mockup-iphone-output');
    const file = await (await dir.getFileHandle(name)).getFile();
    const filename = (url.searchParams.get('name') || name).replace(/[\r\n\x00]/g, '').slice(0, 180);
    const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const inline = url.searchParams.get('inline') === '1';
    const mime = (url.searchParams.get('mime') || '').startsWith('video/webm') || name.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    const headers = new Headers({ 'Content-Type': mime, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`, 'X-Content-Type-Options': 'nosniff' });
    let start = 0, end = file.size - 1, status = 200;
    const range = request.headers.get('Range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
      start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (start > end || start >= file.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
      status = 206; headers.set('Content-Range', `bytes ${start}-${end}/${file.size}`);
    }
    headers.set('Content-Length', String(end - start + 1));
    return new Response(request.method === 'HEAD' ? null : file.slice(start, end + 1).stream(), { status, headers });
  } catch { return new Response('Tệp tạm đã bị xóa. Hãy quay lại trang và xuất lại video.', { status: 404 }); }
}
