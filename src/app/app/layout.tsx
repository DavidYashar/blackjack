import type { Viewport } from 'next';

import { AppScrollGuard } from '@/components/app-scroll-guard';

// Let the background reach the screen edges; .app-shell keeps the content
// inside the device's safe area.
export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="app-shell mx-auto flex h-dvh w-full max-w-md min-w-0 flex-col overflow-hidden">
      <AppScrollGuard />
      {children}
    </main>
  );
}
