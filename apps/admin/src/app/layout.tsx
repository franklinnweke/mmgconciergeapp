import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';

import './globals.css';
import './admin-consolidation.css';
import './operations-dashboard.css';

const inter = localFont({
  variable: '--font-sans',
  display: 'swap',
  src: [
    { path: '../../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf', weight: '400' },
    { path: '../../../../node_modules/@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf', weight: '600' },
    { path: '../../../../node_modules/@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf', weight: '800' },
  ],
});
const playfair = localFont({
  variable: '--font-display',
  display: 'swap',
  src: [
    { path: '../../../../node_modules/@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf', weight: '400' },
    { path: '../../../../node_modules/@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf', weight: '600' },
  ],
});

export const metadata: Metadata = {
  title: 'MMG Concierge Operations',
  description: 'Private booking operations workspace for MMG Concierge.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      {/* Grammar extensions inject body attributes before hydration. Keep this
          exception on body; nested application mismatches still surface. */}
      <body suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
        {children}
      </body>
    </html>
  );
}
