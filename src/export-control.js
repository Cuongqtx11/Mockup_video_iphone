// Every wait has a deadline and is independently interruptible by the UI.
export function abortError() { return new DOMException('Đã hủy xuất.', 'AbortError'); }
export function waitFor(promise, { signal, timeout = 30000, message = 'Tác vụ không phản hồi. Hãy thử lại.' } = {}) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(abortError()); };
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal?.aborted) return aborted();
    signal?.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error(message)); }, timeout);
  });
}
export function checkActive(signal) { if (signal?.aborted) throw abortError(); }
