/**
 * Sound effects.
 *
 * One AudioContext for the app, created on the first real gesture because browsers
 * refuse to start audio without one. Buffers are decoded once and replayed from
 * memory, so a tap is heard immediately rather than after a fetch.
 *
 * Nothing plays before the player touches the screen, and everything respects the
 * mute flag stored on the device.
 */

const STORAGE_KEY = 'duel-dudes:muted';

/** Gap between cards in the opening deal. */
export const DEAL_STEP_MS = 280;

/** How long a card takes to land once it starts moving. */
export const DEALER_LAND_MS = 260;

/** Gap between the dealer's own draws, after its turn. */
export const DEALER_DRAW_MS = 500;

/** Time from the first card to the fourth one landing. */
export const DEAL_TOTAL_MS = DEAL_STEP_MS * 3 + 260;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  if (master && context) {
    master.gain.setTargetAtTime(muted ? 0 : 1, context.currentTime, 0.01);
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = isMuted() ? 0 : 1;
    master.connect(context.destination);
  }
  return context;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const ctx = context;
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  });
}

/** Call from a real click or tap. Safe to call repeatedly. */
export function unlockSfx(): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  unlocked = true;
  void load('deal', '/sound/deal.mp3');
  void load('place', '/sound/place.mp3');
  void load('tap', '/sound/tap.mp3');
}

const files = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * The samples are fetched as soon as the module loads, because a fetch needs no
 * gesture. Only decoding waits for the audio context, which is why returning to the
 * game does not begin with a silent second while a file downloads.
 */
function prefetch(name: string): Promise<ArrayBuffer | null> {
  const cached = files.get(name);
  if (cached) return cached;
  const promise = fetch(`/sound/${name}.mp3`)
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  files.set(name, promise);
  return promise;
}

if (typeof window !== 'undefined') {
  prefetch('deal');
  prefetch('place');
  prefetch('tap');

  // Build the audio context now, while nothing is waiting on it. It starts
  // suspended until the first gesture, but creating it later, at the exact moment a
  // round begins, costs about 180 ms on a phone and that is heard as the cards
  // arriving before their sound.
  ensureContext();
}

async function load(name: string, url: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const inFlight = loading.get(name);
  if (inFlight) return inFlight;

  const ctx = ensureContext();
  if (!ctx) return null;

  const promise = prefetch(name)
    .then((data) => data ?? fetch(url).then((response) => (response.ok ? response.arrayBuffer() : null)))
    .then((data) => (data ? ctx.decodeAudioData(data) : null))
    .then((buffer) => {
      if (buffer) buffers.set(name, buffer);
      loading.delete(name);
      return buffer;
    })
    .catch(() => {
      loading.delete(name);
      return null;
    });

  loading.set(name, promise);
  return promise;
}


type PlayOptions = {
  /** Delay in milliseconds from now. */
  delayMs?: number;
  /** Relative level, 1 being the recorded level. */
  gain?: number;
  /** Play only this many seconds of the sample, fading out at the end. */
  seconds?: number;
};

export function play(name: string, { delayMs = 0, gain = 1, seconds }: PlayOptions = {}): void {
  if (isMuted()) return;
  const ctx = ensureContext();
  if (!ctx || !master) return;

  // A suspended context has a frozen clock, so a sound scheduled now would land
  // whenever the context happens to wake. Wait for it, then play.
  if (ctx.state !== 'running') {
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') play(name, { delayMs, gain, seconds });
      })
      .catch(() => {});
    return;
  }

  const buffer = buffers.get(name);
  if (!buffer) {
    // First hit: decode now and play once it is ready.
    void load(name, `/sound/${name}.mp3`).then((loaded) => {
      if (loaded) play(name, { delayMs, gain, seconds });
    });
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const level = ctx.createGain();
  level.gain.value = gain;
  source.connect(level).connect(master);

  const at = ctx.currentTime + delayMs / 1000;
  const length = seconds ? Math.min(seconds, buffer.duration) : buffer.duration;

  if (seconds && length < buffer.duration) {
    // Fade the cut so a trimmed slide ends on cloth, not on a click.
    const fade = Math.min(0.05, length / 4);
    level.gain.setValueAtTime(gain, at + length - fade);
    level.gain.linearRampToValueAtTime(0, at + length);
  }

  source.start(at, 0, length);
}

/**
 * Four cards, dealt one after another: two to the dealer, two to the player. The
 * cards animate on the same 70 ms cadence, so the sound and the motion agree.
 */
let lastDealAt = 0;

export function playDealSequence(): void {
  if (!unlocked) return;
  // Development runs effects twice; a deal twice in a row is a bug, not a table.
  const now = performance.now();
  if (now - lastDealAt < 400) return;
  lastDealAt = now;
  for (let i = 0; i < 4; i += 1) {
    play('deal', {
      delayMs: i * DEAL_STEP_MS,
      gain: i === 0 ? 0.9 : 0.8,
      // Each slide is trimmed to the gap, so four cards read as four, not a wash.
      seconds: 0.24,
    });
  }
}

/** The click under a button press. Short, and quiet enough to hear fifty times. */
export function playTap(): void {
  play('tap', { gain: 0.7 });
}
