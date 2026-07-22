export interface NdjsonStreamOptions<TEvent> {
  signal?: AbortSignal;
  onEvent: (event: TEvent) => void;
  onDone?: () => void;
  onHeartbeat?: () => void;
  onRawLineError?: (line: string, error: unknown) => void;
}

export async function consumeNdjsonStream<TEvent extends { done?: boolean }>(
  response: Response,
  options: NdjsonStreamOptions<TEvent>,
): Promise<void> {
  if (!response.body) throw new Error('响应正文为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const emitLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith(':')) {
      options.onHeartbeat?.();
      return;
    }

    if (trimmed === '[DONE]') {
      options.onDone?.();
      return;
    }

    let payload: TEvent;
    try {
      payload = JSON.parse(trimmed) as TEvent;
    } catch (error) {
      options.onRawLineError?.(trimmed, error);
      return;
    }

    options.onEvent(payload);
    if (payload.done) {
      options.onDone?.();
    }
  };

  while (true) {
    if (options.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const { value, done } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
    }

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      emitLine(line);
      newlineIndex = buffer.indexOf('\n');
    }

    if (done) {
      const tail = buffer.trim();
      if (tail) emitLine(tail);
      options.onDone?.();
      break;
    }
  }
}
