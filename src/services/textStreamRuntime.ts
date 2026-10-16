import { createStore } from 'zustand/vanilla';
import type { ChatMessage } from '../types/chat';

export interface StreamIdentity {
  scope: 'private-chat' | 'public-chat' | 'code-review';
  conversationId: string;
  requestId: string;
}
export interface StreamSnapshot {
  content: string;
  metadata?: ChatMessage['metadata'];
  streaming: boolean;
}
export const streamDraftStore = createStore<Record<string, StreamSnapshot | undefined>>(() => ({}));

export interface StreamClock {
  now: () => number;
  frame: (callback: (time: number) => void) => number;
  cancelFrame: (id: number) => void;
  delay: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancelDelay: (id: ReturnType<typeof setTimeout>) => void;
}
const clock: StreamClock = {
  now: () => performance.now(),
  frame: callback => typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : 0,
  cancelFrame: id => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); },
  delay: (callback, ms) => setTimeout(callback, ms),
  cancelDelay: id => clearTimeout(id),
};

type SegmenterInstance = { segment: (text: string) => Iterable<{ segment: string; index: number }> };
const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => SegmenterInstance }).Segmenter;
const segmenter = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : undefined;
function boundaries(text: string, offset: number): number[] {
  if (segmenter) return Array.from(segmenter.segment(text), item => offset + item.index + item.segment.length);
  let index = offset;
  return Array.from(text, point => (index += point.length));
}

/** A request owns this object; React only subscribes to immutable visible snapshots. */
export function createTextStreamRuntime(options: {
  identity: StreamIdentity;
  key: string;
  initial?: Omit<StreamSnapshot, 'streaming'>;
  onCheckpoint: (snapshot: StreamSnapshot, terminal: boolean) => void;
  clock?: StreamClock;
  hidden?: () => boolean;
  reducedMotion?: () => boolean;
}) {
  const scheduler = options.clock ?? clock;
  let key = options.key;
  let received: StreamSnapshot = { content: '', ...options.initial, streaming: true };
  let visible = received.content;
  let ends = boundaries(visible, 0);
  let count = ends.length;
  let credit = 0;
  let frame = 0;
  let lastFrame = scheduler.now();
  let checkpoint: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  let ended = false;
  let hiddenOverride = false;
  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
  const hidden = options.hidden ?? (() => typeof document !== 'undefined' && document.hidden);
  const reduced = options.reducedMotion ?? (() => media?.matches ?? false);
  const publish = () => streamDraftStore.setState({ [key]: { ...received, content: visible } });
  const remove = () => {
    const next = { ...streamDraftStore.getState() };
    delete next[key];
    streamDraftStore.setState(next, true);
  };
  const schedule = () => {
    if (!frame && !ended && !hidden()) {
      lastFrame = scheduler.now();
      frame = scheduler.frame(tick);
    }
  };
  const tick = (time: number) => {
    frame = 0;
    if (ended || hidden()) return;
    const pending = ends.length - count;
    const elapsed = Math.max(0, time - lastFrame) / 1000;
    lastFrame = time;
    if (reduced()) count = ends.length;
    else {
      credit += elapsed * Math.max(60, pending / 0.25);
      const advance = Math.min(pending, Math.floor(credit));
      count += advance;
      credit -= advance;
    }
    visible = received.content.slice(0, ends[count - 1] ?? 0);
    publish();
    if (count < ends.length) frame = scheduler.frame(tick);
    else credit = 0;
  };
  const queueCheckpoint = () => {
    if (checkpoint === undefined) checkpoint = scheduler.delay(() => {
      checkpoint = undefined;
      if (!ended && dirty) { dirty = false; options.onCheckpoint(received, false); }
    }, 1000);
  };
  const syncVisible = () => {
    if (frame) scheduler.cancelFrame(frame);
    frame = 0; count = ends.length; credit = 0; visible = received.content;
    publish();
  };
  const visibility = () => {
    if (hidden()) {
      hiddenOverride = true;
      if (frame) scheduler.cancelFrame(frame);
      frame = 0;
    } else if (hiddenOverride) { hiddenOverride = false; syncVisible(); }
  };
  const motion = () => { if (reduced() && !ended) syncVisible(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
  media?.addEventListener('change', motion);
  publish();
  return {
    identity: options.identity,
    get received() { return received; },
    receive(next: Omit<StreamSnapshot, 'streaming'>, replace = false) {
      if (ended) return;
      const previous = received.content;
      const append = !replace && next.content.startsWith(previous);
      // Re-segment the last cluster, since a new chunk may extend an emoji/combining sequence.
      const start = append && ends.length > 1 ? ends[ends.length - 2] : 0;
      ends = (append ? ends.slice(0, -1) : []).concat(boundaries(next.content.slice(start), start));
      received = { ...next, streaming: true };
      dirty = true;
      queueCheckpoint();
      if (replace || !append || reduced()) syncVisible();
      else schedule();
    },
    rekey(nextKey: string) { if (ended || key === nextKey) return; remove(); key = nextKey; publish(); },
    finish(next?: Omit<StreamSnapshot, 'streaming'>) {
      if (ended) return;
      ended = true;
      if (next) received = { ...next, streaming: false };
      else received = { ...received, streaming: false };
      if (frame) scheduler.cancelFrame(frame);
      if (checkpoint !== undefined) scheduler.cancelDelay(checkpoint);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
      media?.removeEventListener('change', motion);
      visible = received.content;
      publish();
      options.onCheckpoint(received, true);
      remove();
    },
  };
}
