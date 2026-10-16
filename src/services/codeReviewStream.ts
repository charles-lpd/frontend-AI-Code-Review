import type { CodeReviewStreamChunk } from '../types/codeReview';
import { readSseFrames } from './streamTransport';

export interface CodeReviewStreamOptions {
  signal?: AbortSignal;
  onEvent: (event: CodeReviewStreamChunk) => void;
  onDone?: () => void;
  onHeartbeat?: () => void;
  onRawLineError?: (frame: string, error: unknown) => void;
}

export async function consumeCodeReviewStream(response: Response, options: CodeReviewStreamOptions): Promise<void> {
  const seen = new Set<number>();
  for await (const frame of readSseFrames(response, options.signal, options.onHeartbeat)) {
    if (frame.data.trim() === '[DONE]') {
      options.onEvent({ done: true });
      break;
    }
    let payload: CodeReviewStreamChunk & { seq?: number };
    try { payload = JSON.parse(frame.data); }
    catch (error) { options.onRawLineError?.(frame.data, error); continue; }
    if (typeof payload.seq === 'number') {
      if (seen.has(payload.seq)) continue;
      seen.add(payload.seq);
    }
    options.onEvent(payload);
    if (('done' in payload && payload.done) || ('type' in payload && payload.type === 'finished')) break;
  }
  options.onDone?.();
}
