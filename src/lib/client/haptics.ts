'use client';

// The phone's vibration, with the browser's own API. Every tap and every game
// moment calls it: a button, a tab, a choice, a pin that lands, a round that ends.
// It does nothing where the browser has no vibration, so it gates nothing.

export type HapticType = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const PATTERN: Record<HapticType, number | number[]> = {
  selection: 8,
  light: 12,
  medium: 20,
  heavy: 32,
  success: [12, 40, 12],
  warning: [20, 60, 20],
  error: [30, 50, 30, 50, 30],
};

/** One vibration. 'selection' is the finest tick, for a tap that changes a value or a tab. */
export function buzz(type: HapticType = 'selection'): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(PATTERN[type]);
}
