import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Duel Dudes',
  description: 'Six blackjack hands, a minute each. Best calls win.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
