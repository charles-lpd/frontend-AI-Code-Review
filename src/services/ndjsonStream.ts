import { readNdjsonLines } from './streamTransport';

export interface NdjsonStreamOptions<TEvent> {
  signal?: AbortSignal;
  onEvent: (event: TEvent) => void;
  onDone?: () => void;
  onHeartbeat?: () => void;
  onRawLineError?: (line: string, error: unknown) => void;
}

export async function consumeNdjsonStream<TEvent extends { done?: boolean }>(response: Response, options: NdjsonStreamOptions<TEvent>): Promise<void> {
  for await (const line of readNdjsonLines(response, options.signal)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith(':')) { options.onHeartbeat?.(); continue; }
    if (trimmed === '[DONE]') break;
    let event: TEvent;
    try { event = JSON.parse(trimmed); }
    catch (error) { options.onRawLineError?.(trimmed, error); continue; }
    options.onEvent(event);
    if (event.done) break;
  }
  options.onDone?.();
}
