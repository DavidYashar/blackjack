'use client';

import type { ButtonHTMLAttributes } from 'react';

import { buzz, type HapticType } from '@/lib/client/haptics';
import { playTap } from '@/lib/client/sfx';

/**
 * A button that buzzes and clicks when tapped, so a screen built from it cannot
 * forget either. The click is heard on the press rather than the release, which is
 * what makes it feel attached to the finger; `tone` is the vibration: 'light' for a
 * tap that does something, 'selection' for one that picks something.
 */
export function Button({
  tone = 'light',
  className,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: HapticType }) {
  return (
    <button
      type="button"
      className={className ?? 'btn'}
      onPointerDown={() => playTap()}
      onClick={(event) => {
        // Keyboard activation fires no pointer event.
        if (event.detail === 0) playTap();
        buzz(tone);
        onClick?.(event);
      }}
      {...rest}
    />
  );
}
