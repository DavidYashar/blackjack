/**
 * Practice history, kept on the device.
 *
 * Practice is free and stays out of the platform's results, so a finished round is
 * remembered locally: enough for the Results tab to show what happened, without
 * writing to the app's store for something that never involves money.
 */

export type HandResult = 'blackjack' | 'win' | 'lose' | 'push' | 'unplayed';

export type RoundRecord = {
  id: string;
  /** When the round finished, in milliseconds. */
  at: number;
  score: number;
  correct: number;
  total: number;
  /** One entry per dealt hand, in order. */
  hands: HandResult[];
};

const KEY = 'duel-dudes:practice-rounds';

function isRecord(value: unknown): value is RoundRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<RoundRecord>;
  return (
    typeof r.id === 'string' &&
    typeof r.at === 'number' &&
    typeof r.score === 'number' &&
    typeof r.correct === 'number' &&
    typeof r.total === 'number' &&
    Array.isArray(r.hands)
  );
}

/** Newest first. Empty when nothing has been played on this device. */
export function loadRounds(): RoundRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).slice(0, 20);
  } catch {
    return [];
  }
}

export function saveRound(round: RoundRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const next = [round, ...loadRounds()].slice(0, 20);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    notify();
  } catch {
    // A full or blocked store is not worth interrupting a game for.
  }
}

/** A hand result that earned nothing, so the review can show it. */
export function isMiss(result: HandResult): boolean {
  return result === 'lose' || result === 'unplayed';
}

const listeners = new Set<() => void>();
let cacheRaw: string | null = null;
let cache: RoundRecord[] = [];

function readRaw(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): RoundRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).slice(0, 20);
  } catch {
    return [];
  }
}

/** A stable snapshot for useSyncExternalStore: same string in, same array out. */
export function roundsSnapshot(): RoundRecord[] {
  const raw = readRaw();
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  cache = parse(raw);
  return cache;
}

const EMPTY: RoundRecord[] = [];

export function roundsServerSnapshot(): RoundRecord[] {
  // A new array each call makes useSyncExternalStore loop; the empty snapshot is
  // the same one every time.
  return EMPTY;
}

export function subscribeRounds(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== 'undefined') window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onChange);
  };
}

function notify(): void {
  cacheRaw = undefined as unknown as string | null;
  for (const listener of listeners) listener();
}
