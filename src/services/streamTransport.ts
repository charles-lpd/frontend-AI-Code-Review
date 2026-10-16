/** Transport only: no business state, persistence, or React dependencies. */
export async function* readStreamText(response: Response, signal?: AbortSignal): AsyncGenerator<string> {
  if (!response.body) throw new Error('响应正文为空');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    while (true) {
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (text) yield text;
      if (done) break;
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export interface SseFrame { data: string; id?: string; event?: string; }

async function* readLines(response: Response, signal?: AbortSignal) {
  let buffer = '';
  for await (const text of readStreamText(response, signal)) {
    buffer += text;
    let boundary: number;
    while ((boundary = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, boundary).replace(/\r$/, '');
      buffer = buffer.slice(boundary + 1);
    }
  }
  if (buffer) yield buffer.replace(/\r$/, '');
}

export async function* readSseFrames(response: Response, signal?: AbortSignal, onHeartbeat?: () => void): AsyncGenerator<SseFrame> {
  let data: string[] = [];
  let id: string | undefined;
  let event: string | undefined;
  for await (const line of readLines(response, signal)) {
    if (line === '') {
      if (data.length) yield { data: data.join('\n'), id, event };
      data = []; event = undefined;
    } else if (line.startsWith(':')) {
      onHeartbeat?.();
    } else {
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') data.push(value);
      if (field === 'id' && !value.includes('\0')) id = value;
      if (field === 'event') event = value;
    }
  }
  if (data.length) yield { data: data.join('\n'), id, event };
}

export { readLines as readNdjsonLines };
