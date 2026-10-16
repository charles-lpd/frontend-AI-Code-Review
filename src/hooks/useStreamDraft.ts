import { useStore } from 'zustand';
import { streamDraftStore } from '../services/textStreamRuntime';

export function useStreamDraft(key?: string) {
  return useStore(streamDraftStore, state => key ? state[key] : undefined);
}
