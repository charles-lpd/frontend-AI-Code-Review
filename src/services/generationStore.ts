import type {
  GenerationHistoryItem,
  GenerationModuleKey,
  GenerationRunSnapshot,
} from '../types/generation';

interface GenerationModuleCache {
  history: GenerationHistoryItem[];
  snapshots: Record<string, GenerationRunSnapshot>;
  activeRunId: string | null;
}

const STORAGE_PREFIX = 'ai-generation-runs';
const MAX_HISTORY_ITEMS = 20;

function getStorageKey(moduleKey: GenerationModuleKey) {
  return `${STORAGE_PREFIX}:${moduleKey}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / serialization errors.
  }
}

function clampHistory(history: GenerationHistoryItem[]) {
  return history.slice(0, MAX_HISTORY_ITEMS);
}

export function loadGenerationCache(moduleKey: GenerationModuleKey): GenerationModuleCache {
  return readJson<GenerationModuleCache>(getStorageKey(moduleKey), {
    history: [],
    snapshots: {},
    activeRunId: null,
  });
}

export function saveGenerationCache(
  moduleKey: GenerationModuleKey,
  cache: GenerationModuleCache,
) {
  writeJson(getStorageKey(moduleKey), {
    ...cache,
    history: clampHistory(cache.history),
  });
}

export function upsertGenerationHistory(
  history: GenerationHistoryItem[],
  item: GenerationHistoryItem,
) {
  const next = history.filter((entry) => entry.runId !== item.runId);
  next.unshift(item);
  return clampHistory(next);
}

export function removeGenerationHistoryItem(
  history: GenerationHistoryItem[],
  runId: string,
) {
  return history.filter((item) => item.runId !== runId);
}

export function upsertGenerationSnapshot(
  snapshots: Record<string, GenerationRunSnapshot>,
  snapshot: GenerationRunSnapshot,
) {
  return {
    ...snapshots,
    [snapshot.runId]: snapshot,
  };
}

export function removeGenerationSnapshot(
  snapshots: Record<string, GenerationRunSnapshot>,
  runId: string,
) {
  const next = { ...snapshots };
  delete next[runId];
  return next;
}
