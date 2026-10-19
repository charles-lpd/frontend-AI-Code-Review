import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Observe rendered content, including image/highlighter reflows, rather than network text. */
export function useChatScroll(ref: RefObject<HTMLDivElement | null>, conversationId: string | undefined, revision?: unknown) {
  const following = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const frame = useRef(0);
  const scrollToLatest = useCallback(() => {
    anchor.current = null;
    following.current = true;
    setShowLatest(false);
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ref]);
  // Pin to bottom instantly. The list uses CSS `scroll-behavior: smooth`, which would otherwise
  // animate every follow-up pin and look like a continuously moving scrollbar.
  const pinToBottom = useCallback((el: HTMLDivElement) => {
    el.scrollTo({ top: el.scrollHeight, behavior: 'instant' as ScrollBehavior });
  }, []);
  const preserveHistory = useCallback(() => {
    const el = ref.current;
    if (el) { anchor.current = { height: el.scrollHeight, top: el.scrollTop }; following.current = false; }
  }, [ref]);
  useLayoutEffect(() => {
    following.current = true; anchor.current = null; setShowLatest(false);
  }, [conversationId]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (anchor.current && el.scrollHeight !== anchor.current.height) {
      el.scrollTop = anchor.current.top + el.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (following.current) pinToBottom(el);
  }, [ref, revision, conversationId, pinToBottom]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active = true;
    let previousTop = el.scrollTop;
    let previousHeight = el.clientHeight;
    const onScroll = () => {
      if (anchor.current) return;
      // A change in viewport height (e.g. the "回到最新" button mounting/unmounting) makes the browser
      // clamp scrollTop. That clamp is not a user scroll-up, so don't flip the follow state for it.
      if (el.clientHeight !== previousHeight) {
        previousHeight = el.clientHeight;
        previousTop = el.scrollTop;
        return;
      }
      const near = el.scrollHeight - el.scrollTop - el.clientHeight <= 100;
      following.current = el.scrollTop < previousTop ? false : near;
      previousTop = el.scrollTop;
      setShowLatest(!following.current);
    };
    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (active && following.current && !anchor.current) { pinToBottom(el); previousTop = el.scrollTop; }
      });
    };
    const resize = new ResizeObserver(() => { previousHeight = el.clientHeight; schedule(); });
    const observe = () => { resize.disconnect(); resize.observe(el); for (const child of el.children) resize.observe(child); schedule(); };
    const mutation = new MutationObserver(observe);
    mutation.observe(el, { childList: true, subtree: true, characterData: true });
    observe(); el.addEventListener('scroll', onScroll, { passive: true });
    return () => { active = false; cancelAnimationFrame(frame.current); frame.current = 0; resize.disconnect(); mutation.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, [ref, conversationId, Boolean(ref.current)]);
  return { showLatest, scrollToLatest, preserveHistory };
}
