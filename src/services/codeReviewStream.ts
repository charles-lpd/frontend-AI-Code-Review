import type { CodeReviewStreamChunk } from '../types/codeReview';

export interface CodeReviewStreamOptions {
  signal?: AbortSignal;
  onEvent: (event: CodeReviewStreamChunk) => void;
  onDone?: () => void;
  onHeartbeat?: () => void;
  onRawLineError?: (frame: string, error: unknown) => void;
}

export async function consumeCodeReviewStream(
  response: Response,
  options: CodeReviewStreamOptions,
): Promise<void> {
  if (!response.body) {
    throw new Error('响应正文为空');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const emitFrame = (frame: string) => {
    const trimmed = frame.trim();
    if (!trimmed) return;

    if (trimmed.startsWith(':')) {
      options.onHeartbeat?.();
      return;
    }

    const dataText = trimmed
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n');

    if (!dataText) return;
    if (dataText === '[DONE]') {
      options.onDone?.();
      options.onEvent({ done: true });
      return;
    }

    let payload: CodeReviewStreamChunk;
    try {
      payload = JSON.parse(dataText) as CodeReviewStreamChunk;
    } catch (error) {
      options.onRawLineError?.(dataText, error);
      return;
    }

    options.onEvent(payload);
    if ('done' in payload && payload.done) {
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

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      emitFrame(frame);
      boundary = buffer.indexOf('\n\n');
    }

    if (done) {
      if (buffer.trim()) {
        emitFrame(buffer);
      }
      options.onDone?.();
      break;
    }
  }
}
